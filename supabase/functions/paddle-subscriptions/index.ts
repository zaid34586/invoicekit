import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function paddleRequest(apiKey: string, baseUrl: string, path: string, init: RequestInit = {}) {
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";

    const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
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

    const { data: billingEvents, error: billingError } = await admin
      .from("billing_events")
      .select("id,provider_event_id,event_name,order_id,subscription_id,plan,billing_cycle,amount,currency,status,receipt_url,created_at,raw_payload")
      .eq("user_id", user.id)
      .eq("provider", "paddle")
      .order("created_at", { ascending: false })
      .limit(25);
    if (billingError) throw billingError;

    if (!subscription) {
      const latest = (billingEvents || []).find((event: any) => event.subscription_id || event.raw_payload?.data?.subscription_id);
      const raw = latest?.raw_payload;
      const remoteSubscriptionId = latest?.subscription_id || raw?.data?.subscription_id || null;
      const remoteCustomerId = raw?.data?.customer_id || null;
      if (remoteSubscriptionId) {
        const { data: recovered, error: recoverError } = await admin.from("subscriptions").upsert({
          user_id: user.id,
          provider: "paddle",
          provider_subscription_id: remoteSubscriptionId,
          provider_customer_id: remoteCustomerId,
          plan: latest?.plan || raw?.data?.custom_data?.plan || "pro",
          billing_cycle: latest?.billing_cycle || raw?.data?.custom_data?.billing_cycle || null,
          status: "active",
          currency: latest?.currency || raw?.data?.currency_code || null,
          amount: latest?.amount || null,
          raw_payload: raw || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" }).select("*").single();
        if (recoverError) throw recoverError;
        subscription = recovered;
      }
    }

    if (action === "status") {
      return Response.json({ ok: true, status: { subscription: subscription || null, billingEvents: billingEvents || [] } }, { headers: corsHeaders });
    }

    if (!subscription?.provider_subscription_id || !subscription?.provider_customer_id) {
      throw new Error("Paddle subscription details are still syncing. Please wait a few seconds and try again.");
    }

    const rawEnvironment = String(subscription.raw_payload?.environment || subscription.raw_payload?.data?.environment || "").toLowerCase();
    const isSandbox = rawEnvironment === "sandbox" || Boolean(Deno.env.get("PADDLE_SANDBOX_API_KEY"));
    const apiKey = isSandbox ? Deno.env.get("PADDLE_SANDBOX_API_KEY") : Deno.env.get("PADDLE_API_KEY");
    if (!apiKey) throw new Error(isSandbox ? "PADDLE_SANDBOX_API_KEY is not configured." : "PADDLE_API_KEY is not configured.");
    const baseUrl = isSandbox ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";

    if (action === "portal") {
      const result = await paddleRequest(apiKey, baseUrl, `/customers/${encodeURIComponent(subscription.provider_customer_id)}/portal-sessions`, {
        method: "POST",
        body: JSON.stringify({ subscription_ids: [subscription.provider_subscription_id] }),
      });
      const urls = result?.data?.urls;
      const subscriptionUrls = Array.isArray(urls?.subscriptions) ? urls.subscriptions[0] : null;
      const mode = String(payload.mode || "overview");
      const url = mode === "cancel" ? subscriptionUrls?.cancel_subscription : mode === "payment_method" ? subscriptionUrls?.update_subscription_payment_method : urls?.general?.overview;
      if (!url) throw new Error("Paddle did not return the requested portal link.");
      return Response.json({ ok: true, url }, { headers: corsHeaders });
    }

    if (action === "cancel") {
      const effectiveFrom = payload.effective_from === "immediately" ? "immediately" : "next_billing_period";
      const result = await paddleRequest(apiKey, baseUrl, `/subscriptions/${encodeURIComponent(subscription.provider_subscription_id)}/cancel`, {
        method: "POST",
        body: JSON.stringify({ effective_from: effectiveFrom }),
      });
      const remote = result?.data;
      const scheduled = remote?.scheduled_change;
      const { data: updated, error: updateError } = await admin.from("subscriptions").update({
        status: remote?.status || subscription.status,
        cancelled: remote?.status === "canceled" || scheduled?.action === "cancel",
        ends_at: scheduled?.effective_at || remote?.canceled_at || subscription.ends_at,
        renews_at: remote?.next_billed_at || subscription.renews_at,
        raw_payload: remote || subscription.raw_payload,
        updated_at: new Date().toISOString(),
      }).eq("user_id", user.id).select("*").single();
      if (updateError) throw updateError;
      return Response.json({ ok: true, subscription: updated }, { headers: corsHeaders });
    }

    if (action === "undo_cancel") {
      const result = await paddleRequest(apiKey, baseUrl, `/subscriptions/${encodeURIComponent(subscription.provider_subscription_id)}`, {
        method: "PATCH",
        body: JSON.stringify({ scheduled_change: null }),
      });
      const remote = result?.data;
      const { data: updated, error: updateError } = await admin.from("subscriptions").update({
        status: remote?.status || "active",
        cancelled: false,
        ends_at: null,
        renews_at: remote?.next_billed_at || subscription.renews_at,
        raw_payload: remote || subscription.raw_payload,
        updated_at: new Date().toISOString(),
      }).eq("user_id", user.id).select("*").single();
      if (updateError) throw updateError;
      return Response.json({ ok: true, subscription: updated }, { headers: corsHeaders });
    }

    throw new Error("Unsupported subscription action.");
  } catch (error) {
    console.error("paddle-subscriptions error", error);
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Unexpected error" }, { status: 400, headers: corsHeaders });
  }
});
