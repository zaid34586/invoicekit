import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

type Environment = "sandbox" | "production";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function config(environment: Environment) {
  const apiKey = environment === "sandbox" ? Deno.env.get("PADDLE_SANDBOX_API_KEY") : Deno.env.get("PADDLE_API_KEY");
  if (!apiKey) throw new Error(environment === "sandbox" ? "PADDLE_SANDBOX_API_KEY is missing." : "PADDLE_API_KEY is missing.");
  return { apiKey, baseUrl: environment === "sandbox" ? "https://sandbox-api.paddle.com" : "https://api.paddle.com" };
}

async function paddle(environment: Environment, path: string, init: RequestInit = {}) {
  const { apiKey, baseUrl } = config(environment);
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.detail || body?.error?.code || `Paddle API returned ${response.status}.`);
  return body;
}

async function recoverSubscription(admin: any, userId: string, subscription: any, events: any[]) {
  if (subscription?.provider_subscription_id && subscription?.provider_customer_id) return subscription;

  const event = events.find((item) => item.subscription_id || item.order_id || item.raw_payload?.data?.subscription_id);
  if (!event) return subscription;
  const raw = event.raw_payload || {};
  const environment: Environment = subscription?.provider_environment === "sandbox" || (raw?._rivox_environment === "sandbox" || raw?.raw_payload?._rivox_environment === "sandbox") ? "sandbox" : "production";
  let subscriptionId = subscription?.provider_subscription_id || event.subscription_id || raw?.data?.subscription_id || null;
  let customerId = subscription?.provider_customer_id || raw?.data?.customer_id || null;

  if ((!subscriptionId || !customerId) && event.order_id) {
    const transaction = await paddle(environment, `/transactions/${encodeURIComponent(event.order_id)}`);
    subscriptionId = subscriptionId || transaction?.data?.subscription_id || null;
    customerId = customerId || transaction?.data?.customer_id || null;
  }
  if (subscriptionId && !customerId) {
    const remote = await paddle(environment, `/subscriptions/${encodeURIComponent(subscriptionId)}`);
    customerId = remote?.data?.customer_id || null;
  }
  if (!subscriptionId) return subscription;

  const payload = {
    user_id: userId,
    provider: "paddle",
    provider_environment: environment,
    provider_subscription_id: subscriptionId,
    provider_customer_id: customerId,
    provider_order_id: event.order_id || subscription?.provider_order_id || null,
    plan: subscription?.plan || event.plan || raw?.data?.custom_data?.plan || "pro",
    billing_cycle: subscription?.billing_cycle || event.billing_cycle || raw?.data?.custom_data?.billing_cycle || null,
    status: subscription?.status || "active",
    currency: subscription?.currency || event.currency || null,
    amount: subscription?.amount || event.amount || null,
    cancelled: subscription?.cancelled || false,
    raw_payload: { ...(subscription?.raw_payload || raw), _rivox_environment: environment },
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await admin.from("subscriptions").upsert(payload, { onConflict: "user_id" }).select("*").single();
  if (error) throw new Error(`Subscription recovery failed: ${error.message}`);
  return data;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: request.headers.get("Authorization") || "" } } });
    const { data: { user }, error: authError } = await auth.auth.getUser();
    if (authError || !user) return json({ ok: false, error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "status");

    const { data: subscriptionRows, error: subscriptionError } = await admin.from("subscriptions").select("*").eq("user_id", user.id).eq("provider", "paddle").order("updated_at", { ascending: false }).limit(1);
    if (subscriptionError) throw new Error(subscriptionError.message);
    let subscription = subscriptionRows?.[0] || null;

    const { data: events, error: eventsError } = await admin.from("billing_events").select("*").eq("user_id", user.id).eq("provider", "paddle").order("created_at", { ascending: false }).limit(25);
    if (eventsError) throw new Error(eventsError.message);

    try {
      subscription = await recoverSubscription(admin, user.id, subscription, events || []);
    } catch (recoveryError) {
      console.error("billing-v2 recovery", recoveryError);
    }

    if (action === "status") {
      const ready = Boolean(subscription?.provider_subscription_id && subscription?.provider_customer_id);
      return json({ ok: true, status: { subscription, billingEvents: events || [], ready, syncMessage: ready ? null : "Paddle identifiers are still syncing." } });
    }

    if (!subscription?.provider_subscription_id || !subscription?.provider_customer_id) {
      return json({ ok: false, error: "Subscription identifiers are not ready. Resend the latest transaction.completed and subscription.activated webhooks." }, 409);
    }

    const environment: Environment = subscription.provider_environment === "sandbox" ? "sandbox" : "production";

    if (action === "portal") {
      const result = await paddle(environment, `/customers/${encodeURIComponent(subscription.provider_customer_id)}/portal-sessions`, {
        method: "POST",
        body: JSON.stringify({ subscription_ids: [subscription.provider_subscription_id] }),
      });
      const urls = result?.data?.urls;
      const subscriptionUrls = Array.isArray(urls?.subscriptions) ? urls.subscriptions[0] : null;
      const mode = String(body.mode || "overview");
      const url = mode === "cancel" ? subscriptionUrls?.cancel_subscription : mode === "payment_method" ? subscriptionUrls?.update_subscription_payment_method : urls?.general?.overview;
      if (!url) throw new Error("Paddle did not return a portal URL.");
      return json({ ok: true, url });
    }

    if (action === "cancel") {
      const effectiveFrom = body.effective_from === "immediately" ? "immediately" : "next_billing_period";
      const result = await paddle(environment, `/subscriptions/${encodeURIComponent(subscription.provider_subscription_id)}/cancel`, { method: "POST", body: JSON.stringify({ effective_from: effectiveFrom }) });
      const remote = result?.data;
      const { data: updated, error } = await admin.from("subscriptions").update({
        status: remote?.status || subscription.status,
        cancelled: remote?.status === "canceled" || remote?.scheduled_change?.action === "cancel",
        ends_at: remote?.scheduled_change?.effective_at || remote?.canceled_at || null,
        cancellation_requested_at: new Date().toISOString(),
        cancellation_effective_at: remote?.scheduled_change?.effective_at || remote?.canceled_at || null,
        renews_at: remote?.next_billed_at || subscription.renews_at,
        updated_at: new Date().toISOString(),
      }).eq("id", subscription.id).select("*").single();
      if (error) throw new Error(error.message);
      return json({ ok: true, subscription: updated });
    }

    if (action === "undo_cancel") {
      const result = await paddle(environment, `/subscriptions/${encodeURIComponent(subscription.provider_subscription_id)}`, { method: "PATCH", body: JSON.stringify({ scheduled_change: null }) });
      const remote = result?.data;
      const { data: updated, error } = await admin.from("subscriptions").update({ cancelled: false, ends_at: null, cancellation_requested_at: null, cancellation_effective_at: null, status: remote?.status || "active", renews_at: remote?.next_billed_at || subscription.renews_at, updated_at: new Date().toISOString() }).eq("id", subscription.id).select("*").single();
      if (error) throw new Error(error.message);
      return json({ ok: true, subscription: updated });
    }

    return json({ ok: false, error: "Unsupported action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected billing error";
    console.error("billing-v2 subscriptions", message, error);
    return json({ ok: false, error: message }, 400);
  }
});
