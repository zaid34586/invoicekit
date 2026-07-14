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

function subscriptionEnvironment(subscription: any): "sandbox" | "production" {
  const value = subscription?.raw_payload?.data?.custom_data?.paddle_environment
    || subscription?.raw_payload?.data?.custom_data?.environment
    || subscription?.raw_payload?.environment;
  return value === "sandbox" ? "sandbox" : "production";
}

async function resolveApiKey(admin: ReturnType<typeof createClient>, environment: "sandbox" | "production") {
  if (environment === "sandbox") {
    const sandboxKey = Deno.env.get("PADDLE_SANDBOX_API_KEY") || Deno.env.get("PADDLE_API_KEY");
    if (!sandboxKey) throw new Error("PADDLE_SANDBOX_API_KEY is not configured in Supabase secrets.");
    return sandboxKey;
  }

  const liveKey = Deno.env.get("PADDLE_LIVE_API_KEY");
  if (liveKey) return liveKey;

  const { data: credential, error: credentialError } = await admin
    .from("admin_paddle_credentials")
    .select("encrypted_key,encryption_iv")
    .eq("id", "primary")
    .single();
  if (credentialError) throw credentialError;
  if (!credential?.encrypted_key || !credential?.encryption_iv) {
    throw new Error("Live Paddle API key is not configured in Rivox Admin.");
  }
  return decrypt(credential.encrypted_key, credential.encryption_iv);
}

async function paddleRequest(apiKey: string, environment: "sandbox" | "production", path: string, init: RequestInit = {}) {
  const baseUrl = environment === "sandbox" ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";
  const response = await fetch(`${baseUrl}${path}`, {
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

async function recoverSubscription(admin: ReturnType<typeof createClient>, userId: string) {
  const { data: event, error } = await admin
    .from("billing_events")
    .select("subscription_id,plan,billing_cycle,currency,amount,raw_payload,created_at")
    .eq("user_id", userId)
    .eq("provider", "paddle")
    .eq("status", "completed")
    .not("subscription_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !event?.subscription_id) return null;

  const payload = event.raw_payload?.data || {};
  const { data: recovered, error: upsertError } = await admin
    .from("subscriptions")
    .upsert({
      user_id: userId,
      provider: "paddle",
      provider_subscription_id: event.subscription_id,
      provider_customer_id: payload.customer_id || null,
      product_id: payload.items?.[0]?.price?.product_id || null,
      variant_id: payload.items?.[0]?.price?.id || null,
      plan: event.plan || payload.custom_data?.plan || "pro",
      billing_cycle: event.billing_cycle || payload.custom_data?.billing_cycle || null,
      status: "active",
      currency: event.currency || payload.currency_code || null,
      amount: event.amount || null,
      renews_at: payload.next_billed_at || null,
      cancelled: false,
      raw_payload: event.raw_payload,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" })
    .select("*")
    .single();
  if (upsertError) throw upsertError;
  return recovered;
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

    let { data: subscription, error: subscriptionError } = await admin
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", "paddle")
      .maybeSingle();
    if (subscriptionError) throw subscriptionError;

    if (!subscription?.provider_subscription_id) {
      subscription = await recoverSubscription(admin, user.id);
    }

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
      throw new Error("Paddle subscription is still syncing. Refresh once and try again.");
    }

    const environment = subscriptionEnvironment(subscription);
    const apiKey = await resolveApiKey(admin, environment);

    if (action === "portal") {
      const result = await paddleRequest(apiKey, environment, `/customers/${encodeURIComponent(subscription.provider_customer_id)}/portal-sessions`, {
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
      const result = await paddleRequest(apiKey, environment, `/subscriptions/${encodeURIComponent(subscription.provider_subscription_id)}/cancel`, {
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
          raw_payload: { ...subscription.raw_payload, data: remote || subscription.raw_payload?.data },
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id)
        .select("*")
        .single();
      if (updateError) throw updateError;
      return Response.json({ ok: true, subscription: updated }, { headers: corsHeaders });
    }

    if (action === "undo_cancel") {
      const result = await paddleRequest(apiKey, environment, `/subscriptions/${encodeURIComponent(subscription.provider_subscription_id)}`, {
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
          raw_payload: { ...subscription.raw_payload, data: remote || subscription.raw_payload?.data },
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
