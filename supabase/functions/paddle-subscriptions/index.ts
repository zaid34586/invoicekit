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

function normalizeEnvironment(value: unknown): Environment {
  return value === "sandbox" ? "sandbox" : "production";
}

function paddleConfig(environment: Environment) {
  const apiKey = environment === "sandbox"
    ? Deno.env.get("PADDLE_SANDBOX_API_KEY")
    : Deno.env.get("PADDLE_API_KEY");
  if (!apiKey) {
    throw new Error(environment === "sandbox"
      ? "PADDLE_SANDBOX_API_KEY is missing."
      : "PADDLE_API_KEY is missing.");
  }
  return {
    apiKey,
    baseUrl: environment === "sandbox"
      ? "https://sandbox-api.paddle.com"
      : "https://api.paddle.com",
  };
}

async function paddle(environment: Environment, path: string, init: RequestInit = {}) {
  const { apiKey, baseUrl } = paddleConfig(environment);
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body?.error?.detail || body?.error?.code || body?.error?.type;
    throw new Error(detail || `Paddle API returned ${response.status}.`);
  }
  return body;
}

function amountFromTransaction(transaction: any): number {
  const raw = transaction?.details?.totals?.grand_total ?? transaction?.details?.totals?.total ?? "0";
  const value = Number(raw);
  return Number.isFinite(value) ? value / 100 : 0;
}

function cycleFromTransaction(transaction: any): string | null {
  const custom = transaction?.custom_data?.billing_cycle;
  if (custom === "monthly" || custom === "yearly") return custom;
  const interval = transaction?.items?.[0]?.price?.billing_cycle?.interval;
  if (interval === "month") return "monthly";
  if (interval === "year") return "yearly";
  return null;
}

function planFromTransaction(transaction: any): "pro" | "business" {
  const plan = String(transaction?.custom_data?.plan || "").toLowerCase();
  if (plan === "business") return "business";
  if (plan === "pro") return "pro";
  const text = JSON.stringify(transaction?.items || []).toLowerCase();
  if (text.includes("business")) return "business";
  if (text.includes("pro")) return "pro";
  throw new Error("The Paddle transaction does not contain a recognized Rivox plan.");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return json({ ok: false, error: "Supabase server configuration is incomplete." }, 500);
    }

    const authorization = request.headers.get("Authorization") || "";
    const auth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: { user }, error: authError } = await auth.auth.getUser();
    if (authError || !user) return json({ ok: false, error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "status");

    if (action === "sync_transaction") {
      const transactionId = String(body.transaction_id || "").trim();
      if (!/^txn_[a-zA-Z0-9]+$/.test(transactionId)) {
        return json({ ok: false, error: "A valid Paddle transaction ID is required." }, 400);
      }
      const environment = normalizeEnvironment(body.environment);
      const response = await paddle(environment, `/transactions/${encodeURIComponent(transactionId)}`);
      const transaction = response?.data;
      if (!transaction) throw new Error("Paddle returned no transaction data.");
      if (transaction.status !== "completed") {
        return json({ ok: false, error: `Payment is not completed yet (status: ${transaction.status || "unknown"}).` }, 409);
      }

      const customUserId = String(transaction?.custom_data?.user_id || "").trim();
      const customEmail = String(transaction?.custom_data?.customer_email || "").trim().toLowerCase();
      if (customUserId && customUserId !== user.id) {
        return json({ ok: false, error: "This payment belongs to a different Rivox account." }, 403);
      }
      if (!customUserId && customEmail && customEmail !== String(user.email || "").toLowerCase()) {
        return json({ ok: false, error: "This payment email does not match the signed-in Rivox account." }, 403);
      }

      const plan = planFromTransaction(transaction);
      const billingCycle = cycleFromTransaction(transaction);
      const subscriptionId = transaction.subscription_id || null;
      const customerId = transaction.customer_id || null;
      if (!subscriptionId || !customerId) {
        return json({ ok: false, error: "Paddle payment is completed but subscription identifiers are not ready yet. Try Check again in a few seconds." }, 409);
      }

      const activationPayload = {
        p_user_id: user.id,
        p_environment: environment,
        p_transaction_id: transactionId,
        p_subscription_id: subscriptionId,
        p_customer_id: customerId,
        p_plan: plan,
        p_billing_cycle: billingCycle,
        p_status: "active",
        p_currency: transaction.currency_code || null,
        p_amount: amountFromTransaction(transaction),
        p_customer_email: transaction?.custom_data?.customer_email || user.email || null,
        p_renews_at: transaction?.billing_period?.ends_at || null,
        p_product_id: transaction?.items?.[0]?.price?.product_id || null,
        p_price_id: transaction?.items?.[0]?.price?.id || null,
        p_raw_payload: transaction,
      };

      const { data: activation, error: activationError } = await admin.rpc(
        "activate_paddle_transaction_v3",
        activationPayload,
      );
      if (activationError) throw new Error(`Database activation failed: ${activationError.message}`);

      const { data: subscription, error: subscriptionError } = await admin
        .from("subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .eq("provider", "paddle")
        .eq("provider_environment", environment)
        .maybeSingle();
      if (subscriptionError) throw new Error(subscriptionError.message);

      const { data: billingEvents, error: eventsError } = await admin
        .from("billing_events")
        .select("*")
        .eq("user_id", user.id)
        .eq("provider", "paddle")
        .order("created_at", { ascending: false })
        .limit(25);
      if (eventsError) throw new Error(eventsError.message);

      return json({ ok: true, subscription, billingEvents: billingEvents || [], plan, activation });
    }

    const environment = normalizeEnvironment(body.environment);
    let subscriptionQuery = admin
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", "paddle")
      .order("updated_at", { ascending: false })
      .limit(1);
    if (body.environment === "sandbox" || body.environment === "production") {
      subscriptionQuery = subscriptionQuery.eq("provider_environment", environment);
    }
    const { data: subscriptionRows, error: subscriptionError } = await subscriptionQuery;
    if (subscriptionError) throw new Error(subscriptionError.message);
    const subscription = subscriptionRows?.[0] || null;

    const { data: events, error: eventsError } = await admin
      .from("billing_events")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", "paddle")
      .order("created_at", { ascending: false })
      .limit(25);
    if (eventsError) throw new Error(eventsError.message);

    if (action === "status") {
      const ready = Boolean(subscription?.provider_subscription_id && subscription?.provider_customer_id);
      return json({ ok: true, status: { subscription, billingEvents: events || [], ready, syncMessage: ready ? null : "No verified Paddle subscription is linked yet." } });
    }

    if (!subscription?.provider_subscription_id || !subscription?.provider_customer_id) {
      return json({ ok: false, error: "No verified Paddle subscription is linked to this account." }, 409);
    }

    const subscriptionEnvironment: Environment = subscription.provider_environment === "sandbox" ? "sandbox" : "production";

    if (action === "portal") {
      const result = await paddle(subscriptionEnvironment, `/customers/${encodeURIComponent(subscription.provider_customer_id)}/portal-sessions`, {
        method: "POST",
        body: JSON.stringify({ subscription_ids: [subscription.provider_subscription_id] }),
      });
      const urls = result?.data?.urls;
      const subscriptionUrls = Array.isArray(urls?.subscriptions) ? urls.subscriptions[0] : null;
      const mode = String(body.mode || "overview");
      const url = mode === "cancel"
        ? subscriptionUrls?.cancel_subscription
        : mode === "payment_method"
          ? subscriptionUrls?.update_subscription_payment_method
          : urls?.general?.overview;
      if (!url) throw new Error("Paddle did not return a portal URL.");
      return json({ ok: true, url });
    }

    if (action === "cancel") {
      const effectiveFrom = body.effective_from === "immediately" ? "immediately" : "next_billing_period";
      const result = await paddle(subscriptionEnvironment, `/subscriptions/${encodeURIComponent(subscription.provider_subscription_id)}/cancel`, {
        method: "POST",
        body: JSON.stringify({ effective_from: effectiveFrom }),
      });
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
      const result = await paddle(subscriptionEnvironment, `/subscriptions/${encodeURIComponent(subscription.provider_subscription_id)}`, {
        method: "PATCH",
        body: JSON.stringify({ scheduled_change: null }),
      });
      const remote = result?.data;
      const { data: updated, error } = await admin.from("subscriptions").update({
        cancelled: false,
        ends_at: null,
        cancellation_requested_at: null,
        cancellation_effective_at: null,
        status: remote?.status || "active",
        renews_at: remote?.next_billed_at || subscription.renews_at,
        updated_at: new Date().toISOString(),
      }).eq("id", subscription.id).select("*").single();
      if (error) throw new Error(error.message);
      return json({ ok: true, subscription: updated });
    }

    return json({ ok: false, error: "Unsupported action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected billing error";
    console.error("billing-v3 paddle-subscriptions", { message, error });
    return json({ ok: false, error: message }, 500);
  }
});
