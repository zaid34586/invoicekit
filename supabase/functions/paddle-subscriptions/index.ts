import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function encryptionKey() {
  const secret = Deno.env.get("PADDLE_KEY_ENCRYPTION_SECRET");
  if (!secret || secret.length < 32) throw new Error("PADDLE_KEY_ENCRYPTION_SECRET is missing or too short.");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["decrypt"]);
}

async function decrypt(encryptedKey: string, ivValue: string) {
  const key = await encryptionKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivValue) },
    key,
    fromBase64(encryptedKey),
  );
  return decoder.decode(decrypted);
}

async function paddleRequest(apiKey: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`https://api.paddle.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const body = await response.text();
  let parsed: any = null;
  try { parsed = body ? JSON.parse(body) : null; } catch { parsed = null; }
  if (!response.ok) {
    const detail = parsed?.error?.detail || parsed?.error?.type || body || `Paddle returned ${response.status}`;
    throw new Error(String(detail).slice(0, 500));
  }
  return parsed;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const payload = await req.json().catch(() => ({}));
    const action = String(payload.action || "status");

    const { data: subscription, error: subscriptionError } = await admin
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", "paddle")
      .maybeSingle();
    if (subscriptionError) throw subscriptionError;

    if (action === "status") {
      const { data: billingEvents, error: billingError } = await admin
        .from("billing_events")
        .select("id,provider_event_id,event_name,order_id,subscription_id,plan,billing_cycle,amount,currency,status,receipt_url,created_at")
        .eq("user_id", user.id)
        .eq("provider", "paddle")
        .order("created_at", { ascending: false })
        .limit(25);
      if (billingError) throw billingError;

      return Response.json({
        ok: true,
        status: { subscription: subscription || null, billingEvents: billingEvents || [] },
      }, { headers: corsHeaders });
    }

    if (!subscription?.provider_subscription_id || !subscription?.provider_customer_id) {
      throw new Error("No active Paddle subscription is linked to this account yet.");
    }

    const { data: credential, error: credentialError } = await admin
      .from("admin_paddle_credentials")
      .select("encrypted_key,encryption_iv")
      .eq("id", "primary")
      .single();
    if (credentialError) throw credentialError;
    if (!credential?.encrypted_key || !credential?.encryption_iv) throw new Error("Paddle API key is not configured in Rivox Admin.");

    const apiKey = await decrypt(credential.encrypted_key, credential.encryption_iv);

    if (action === "portal") {
      const result = await paddleRequest(apiKey, `/customers/${encodeURIComponent(subscription.provider_customer_id)}/portal-sessions`, {
        method: "POST",
        body: JSON.stringify({ subscription_ids: [subscription.provider_subscription_id] }),
      });
      const urls = result?.data?.urls;
      const subscriptionUrls = Array.isArray(urls?.subscriptions) ? urls.subscriptions[0] : null;
      const mode = String(payload.mode || "overview");
      const url = mode === "cancel"
        ? subscriptionUrls?.cancel_subscription
        : mode === "payment_method"
          ? subscriptionUrls?.update_subscription_payment_method
          : urls?.general?.overview;
      if (!url) throw new Error("Paddle did not return the requested portal link.");
      return Response.json({ ok: true, url }, { headers: corsHeaders });
    }

    if (action === "cancel") {
      const effectiveFrom = payload.effective_from === "immediately" ? "immediately" : "next_billing_period";
      const result = await paddleRequest(apiKey, `/subscriptions/${encodeURIComponent(subscription.provider_subscription_id)}/cancel`, {
        method: "POST",
        body: JSON.stringify({ effective_from: effectiveFrom }),
      });
      const remote = result?.data;
      const status = remote?.status || subscription.status;
      const scheduled = remote?.scheduled_change;
      const { data: updated, error: updateError } = await admin
        .from("subscriptions")
        .update({
          status,
          cancelled: status === "canceled" || scheduled?.action === "cancel",
          ends_at: scheduled?.effective_at || remote?.canceled_at || subscription.ends_at,
          renews_at: remote?.next_billed_at || subscription.renews_at,
          raw_payload: remote || subscription.raw_payload,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id)
        .select("*")
        .single();
      if (updateError) throw updateError;
      return Response.json({ ok: true, subscription: updated }, { headers: corsHeaders });
    }

    if (action === "undo_cancel") {
      const result = await paddleRequest(apiKey, `/subscriptions/${encodeURIComponent(subscription.provider_subscription_id)}`, {
        method: "PATCH",
        body: JSON.stringify({ scheduled_change: null }),
      });
      const remote = result?.data;
      const { data: updated, error: updateError } = await admin
        .from("subscriptions")
        .update({
          status: remote?.status || "active",
          cancelled: false,
          ends_at: null,
          renews_at: remote?.next_billed_at || subscription.renews_at,
          raw_payload: remote || subscription.raw_payload,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id)
        .select("*")
        .single();
      if (updateError) throw updateError;
      return Response.json({ ok: true, subscription: updated }, { headers: corsHeaders });
    }

    throw new Error("Unsupported subscription action.");
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Unexpected error" }, {
      status: 400,
      headers: corsHeaders,
    });
  }
});
