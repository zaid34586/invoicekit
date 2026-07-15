import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Environment = "sandbox" | "production";

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

function getStoredEnvironment(rawPayload: any): Environment | null {
  const value = String(
    rawPayload?._rivox_environment ||
    rawPayload?.environment ||
    rawPayload?.data?._rivox_environment ||
    rawPayload?.data?.environment ||
    "",
  ).toLowerCase();
  if (value === "sandbox") return "sandbox";
  if (value === "production" || value === "live") return "production";
  return null;
}

function getPaddleConfig(environment: Environment) {
  const apiKey = environment === "sandbox" ? Deno.env.get("PADDLE_SANDBOX_API_KEY") : Deno.env.get("PADDLE_API_KEY");
  if (!apiKey) throw new Error(environment === "sandbox" ? "PADDLE_SANDBOX_API_KEY is not configured." : "PADDLE_API_KEY is not configured.");
  return {
    apiKey,
    baseUrl: environment === "sandbox" ? "https://sandbox-api.paddle.com" : "https://api.paddle.com",
  };
}

async function hydrateSubscription(admin: any, subscription: any, billingEvents: any[], userId: string) {
  if (subscription?.provider_subscription_id && subscription?.provider_customer_id) return subscription;

  const latest = (billingEvents || []).find((event: any) => event.subscription_id || event.raw_payload?.data?.subscription_id);
  const raw = latest?.raw_payload || subscription?.raw_payload || null;
  const remoteSubscriptionId = subscription?.provider_subscription_id || latest?.subscription_id || raw?.data?.subscription_id || null;
  let remoteCustomerId = subscription?.provider_customer_id || raw?.data?.customer_id || null;
  const environment = getStoredEnvironment(raw);

  if (!remoteSubscriptionId) return subscription || null;

  let remote: any = null;
  if (environment) {
    try {
      const { apiKey, baseUrl } = getPaddleConfig(environment);
      const result = await paddleRequest(apiKey, baseUrl, `/subscriptions/${encodeURIComponent(remoteSubscriptionId)}`);
      remote = result?.data || null;
      remoteCustomerId = remote?.customer_id || remoteCustomerId;
    } catch (error) {
      console.error("subscription hydration from Paddle failed", { userId, remoteSubscriptionId, environment, error });
    }
  }

  const payload = {
    user_id: userId,
    provider: "paddle",
    provider_subscription_id: remoteSubscriptionId,
    provider_customer_id: remoteCustomerId,
    product_id: remote?.items?.[0]?.price?.product_id || subscription?.product_id || null,
    variant_id: remote?.items?.[0]?.price?.id || subscription?.variant_id || null,
    plan: subscription?.plan || latest?.plan || raw?.data?.custom_data?.plan || "pro",
    billing_cycle: subscription?.billing_cycle || latest?.billing_cycle || raw?.data?.custom_data?.billing_cycle || null,
    status: remote?.status || subscription?.status || "active",
    currency: remote?.currency_code || subscription?.currency || latest?.currency || raw?.data?.currency_code || null,
    amount: subscription?.amount || latest?.amount || null,
    renews_at: remote?.next_billed_at || subscription?.renews_at || null,
    ends_at: remote?.scheduled_change?.effective_at || remote?.canceled_at || subscription?.ends_at || null,
    cancelled: remote?.status === "canceled" || remote?.scheduled_change?.action === "cancel" || subscription?.cancelled || false,
    raw_payload: remote ? { ...remote, _rivox_environment: environment } : raw || {},
    updated_at: new Date().toISOString(),
  };

  const { data: recovered, error } = await admin.from("subscriptions").upsert(payload, { onConflict: "user_id" }).select("*").single();
  if (error) {
    console.error("subscription recovery upsert failed", { userId, error, payload });
    throw new Error(`Unable to sync subscription record: ${error.message}`);
  }
  return recovered;
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
    if (authError || !user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: corsHeaders });

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const payload = await req.json().catch(() => ({}));
    const action = String(payload.action || "status");

    const { data: subscriptions, error: subscriptionError } = await admin
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", "paddle")
      .order("updated_at", { ascending: false })
      .limit(1);
    if (subscriptionError) throw new Error(`Unable to read subscription: ${subscriptionError.message}`);
    let subscription = subscriptions?.[0] || null;

    const { data: billingEvents, error: billingError } = await admin
      .from("billing_events")
      .select("id,provider_event_id,event_name,order_id,subscription_id,plan,billing_cycle,amount,currency,status,receipt_url,created_at,raw_payload")
      .eq("user_id", user.id)
      .eq("provider", "paddle")
      .order("created_at", { ascending: false })
      .limit(25);
    if (billingError) throw new Error(`Unable to read billing history: ${billingError.message}`);

    try {
      subscription = await hydrateSubscription(admin, subscription, billingEvents || [], user.id);
    } catch (error) {
      console.error("status hydration warning", error);
      if (action !== "status") throw error;
    }

    if (action === "status") {
      const ready = Boolean(subscription?.provider_subscription_id && subscription?.provider_customer_id);
      return Response.json({
        ok: true,
        status: {
          subscription: subscription || null,
          billingEvents: billingEvents || [],
          ready,
          syncMessage: ready ? null : "Paddle subscription identifiers are still syncing.",
        },
      }, { headers: corsHeaders });
    }

    if (!subscription?.provider_subscription_id || !subscription?.provider_customer_id) {
      throw new Error("Paddle subscription details are still syncing. Retry after the latest webhook is delivered.");
    }

    const environment = getStoredEnvironment(subscription.raw_payload);
    if (!environment) throw new Error("Subscription environment is missing. Resend the latest Paddle webhook after deploying the environment-aware webhook.");
    const { apiKey, baseUrl } = getPaddleConfig(environment);

    console.log("paddle-subscriptions action", { action, userId: user.id, environment, subscriptionId: subscription.provider_subscription_id, customerId: subscription.provider_customer_id });

    if (action === "portal") {
      const result = await paddleRequest(apiKey, baseUrl, `/customers/${encodeURIComponent(subscription.provider_customer_id)}/portal-sessions`, {
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
      if (!url) throw new Error("Paddle did not return the requested customer portal link.");
      await admin.from("subscriptions").update({ last_portal_opened_at: new Date().toISOString() }).eq("user_id", user.id);
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
        cancellation_requested_at: new Date().toISOString(),
        cancellation_effective_at: scheduled?.effective_at || remote?.canceled_at || null,
        renews_at: remote?.next_billed_at || subscription.renews_at,
        raw_payload: { ...remote, _rivox_environment: environment },
        updated_at: new Date().toISOString(),
      }).eq("user_id", user.id).select("*").single();
      if (updateError) throw new Error(`Unable to save cancellation: ${updateError.message}`);
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
        cancellation_requested_at: null,
        cancellation_effective_at: null,
        renews_at: remote?.next_billed_at || subscription.renews_at,
        raw_payload: { ...remote, _rivox_environment: environment },
        updated_at: new Date().toISOString(),
      }).eq("user_id", user.id).select("*").single();
      if (updateError) throw new Error(`Unable to remove cancellation: ${updateError.message}`);
      return Response.json({ ok: true, subscription: updated }, { headers: corsHeaders });
    }

    throw new Error("Unsupported subscription action.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("paddle-subscriptions error", { message, error });
    return Response.json({ ok: false, error: message }, { status: 400, headers: corsHeaders });
  }
});
