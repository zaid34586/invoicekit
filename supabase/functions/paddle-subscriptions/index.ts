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

function environmentConfig(environment: Environment) {
  const apiKey = environment === "sandbox"
    ? Deno.env.get("PADDLE_SANDBOX_API_KEY")?.trim()
    : Deno.env.get("PADDLE_API_KEY")?.trim();
  if (!apiKey) {
    throw new Error(environment === "sandbox"
      ? "PADDLE_SANDBOX_API_KEY is missing."
      : "PADDLE_API_KEY is missing.");
  }
  return {
    apiKey,
    baseUrl: environment === "sandbox" ? "https://sandbox-api.paddle.com" : "https://api.paddle.com",
  };
}

async function paddleRequest(environment: Environment, path: string, init: RequestInit = {}) {
  const { apiKey, baseUrl } = environmentConfig(environment);
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
    const detail = body?.error?.detail || body?.error?.code || body?.message || `Paddle API returned ${response.status}.`;
    throw new Error(String(detail));
  }
  return body;
}

async function findTransaction(transactionId: string, preferred?: Environment) {
  const order: Environment[] = preferred
    ? [preferred, preferred === "sandbox" ? "production" : "sandbox"]
    : ["sandbox", "production"];
  const errors: string[] = [];
  for (const environment of order) {
    try {
      const result = await paddleRequest(environment, `/transactions/${encodeURIComponent(transactionId)}`);
      return { environment, transaction: result?.data };
    } catch (error) {
      errors.push(`${environment}: ${error instanceof Error ? error.message : "lookup failed"}`);
    }
  }
  throw new Error(`Transaction ${transactionId} was not found. ${errors.join(" | ")}`);
}

function normalizePlan(value: unknown): "free" | "pro" | "business" {
  const plan = String(value || "").toLowerCase();
  if (plan === "business") return "business";
  if (plan === "pro") return "pro";
  return "free";
}

function amountFromTransaction(transaction: any) {
  const raw = transaction?.details?.totals?.grand_total ?? transaction?.details?.totals?.total ?? "0";
  const number = Number(raw);
  return Number.isFinite(number) ? number / 100 : 0;
}

async function updateProfile(admin: any, user: { id: string; email?: string | null }, plan: "pro" | "business", subscriptionId: string | null, status = "active") {
  const update = {
    user_id: user.id,
    plan,
    is_pro: true,
    subscription_status: status === "active" ? "active" : status,
    subscription_id: subscriptionId,
    plan_expires_at: null,
  };

  let query = admin.from("profiles").update(update).eq("user_id", user.id).select("id");
  let { data, error } = await query;
  if (error) throw new Error(`Profile update failed: ${error.message}`);

  if ((!data || data.length === 0) && user.email) {
    const result = await admin.from("profiles")
      .update(update)
      .ilike("email", user.email)
      .select("id");
    if (result.error) throw new Error(`Profile email fallback failed: ${result.error.message}`);
    data = result.data;
  }

  if (!data || data.length === 0) {
    throw new Error("No Rivox profile matched the authenticated user. Profile activation was not written.");
  }
  return true;
}

async function upsertVerifiedTransaction(admin: any, user: { id: string; email?: string | null }, environment: Environment, transaction: any) {
  if (!transaction?.id) throw new Error("Paddle transaction response is missing an ID.");
  if (transaction.status !== "completed") throw new Error(`Payment is not completed yet (status: ${transaction.status || "unknown"}).`);

  const custom = transaction.custom_data || {};
  const transactionUserId = custom.user_id || custom.userId || null;
  const transactionEmail = String(custom.customer_email || "").trim().toLowerCase();
  const authEmail = String(user.email || "").trim().toLowerCase();

  if (transactionUserId && transactionUserId !== user.id) {
    throw new Error("This Paddle transaction belongs to a different Rivox user.");
  }
  if (!transactionUserId && transactionEmail && authEmail && transactionEmail !== authEmail) {
    throw new Error("This Paddle transaction email does not match the signed-in user.");
  }

  const plan = normalizePlan(custom.plan);
  if (plan === "free") throw new Error("Paddle transaction does not contain a valid paid plan in custom_data.plan.");

  const subscriptionId = transaction.subscription_id || null;
  const customerId = transaction.customer_id || null;
  if (!subscriptionId) throw new Error("Completed transaction has no Paddle subscription ID.");
  if (!customerId) throw new Error("Completed transaction has no Paddle customer ID.");

  let remoteSubscription: any = null;
  try {
    const result = await paddleRequest(environment, `/subscriptions/${encodeURIComponent(subscriptionId)}`);
    remoteSubscription = result?.data || null;
  } catch (error) {
    console.warn("[billing-v2] subscription detail lookup failed", error);
  }

  const now = new Date().toISOString();
  const subscriptionPayload = {
    user_id: user.id,
    provider: "paddle",
    provider_environment: environment,
    provider_subscription_id: subscriptionId,
    provider_customer_id: customerId,
    provider_order_id: transaction.id,
    product_id: transaction.items?.[0]?.price?.product_id || remoteSubscription?.items?.[0]?.price?.product_id || null,
    variant_id: transaction.items?.[0]?.price?.id || remoteSubscription?.items?.[0]?.price?.id || null,
    plan,
    billing_cycle: custom.billing_cycle || remoteSubscription?.items?.[0]?.price?.billing_cycle?.interval || null,
    status: remoteSubscription?.status || "active",
    customer_email: transactionEmail || authEmail || null,
    currency: transaction.currency_code || null,
    amount: amountFromTransaction(transaction),
    renews_at: remoteSubscription?.next_billed_at || transaction.billing_period?.ends_at || null,
    ends_at: remoteSubscription?.scheduled_change?.effective_at || remoteSubscription?.canceled_at || null,
    cancelled: remoteSubscription?.status === "canceled" || remoteSubscription?.scheduled_change?.action === "cancel",
    raw_payload: { transaction, subscription: remoteSubscription, _rivox_environment: environment, _rivox_sync_source: "success_return" },
    updated_at: now,
  };

  // subscriptions.user_id is UNIQUE in the current schema. Upsert by user_id,
  // not by a non-existent composite constraint.
  const { data: subscription, error: subscriptionError } = await admin
    .from("subscriptions")
    .upsert(subscriptionPayload, { onConflict: "user_id,provider_environment" })
    .select("*")
    .single();
  if (subscriptionError) throw new Error(`Subscription upsert failed: ${subscriptionError.message}`);

  const eventPayload = {
    provider_event_id: `sync:${environment}:${transaction.id}`,
    user_id: user.id,
    provider: "paddle",
    provider_environment: environment,
    event_name: "transaction.synced",
    order_id: transaction.id,
    subscription_id: subscriptionId,
    plan,
    billing_cycle: custom.billing_cycle || null,
    amount: amountFromTransaction(transaction),
    currency: transaction.currency_code || null,
    status: transaction.status,
    receipt_url: transaction.checkout?.url || null,
    raw_payload: transaction,
  };
  const { data: billingEvent, error: eventError } = await admin
    .from("billing_events")
    .upsert(eventPayload, { onConflict: "provider_event_id" })
    .select("*")
    .maybeSingle();
  if (eventError) throw new Error(`Billing history upsert failed: ${eventError.message}`);

  const profileUpdated = await updateProfile(admin, user, plan, subscriptionId, "active");
  return { subscription, billingEvent: billingEvent || null, profileUpdated, environment };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) throw new Error("Supabase Edge Function configuration is incomplete.");

    const auth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: request.headers.get("Authorization") || "" } },
    });
    const { data: { user }, error: authError } = await auth.auth.getUser();
    if (authError || !user) return json({ ok: false, error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "status");

    if (action === "sync_transaction") {
      const transactionId = String(body.transaction_id || "").trim();
      if (!/^txn_[A-Za-z0-9]+$/.test(transactionId)) {
        return json({ ok: false, error: "A valid Paddle transaction ID is required." }, 400);
      }
      const preferred = body.environment === "sandbox" || body.environment === "production"
        ? body.environment as Environment
        : undefined;
      const { environment, transaction } = await findTransaction(transactionId, preferred);
      const result = await upsertVerifiedTransaction(admin, user, environment, transaction);
      console.log("[billing-v2] transaction activated", { userId: user.id, transactionId, environment, plan: result.subscription.plan });
      return json({ ok: true, ...result });
    }

    if (action === "health") {
      const errors: string[] = [];
      const { data: profile, error: profileError } = await admin.from("profiles").select("id,user_id,email,plan,is_pro").or(`user_id.eq.${user.id},email.ilike.${user.email || "__none__"}`).limit(1).maybeSingle();
      if (profileError) errors.push(`profile: ${profileError.message}`);
      const { data: subscription, error: subscriptionError } = await admin.from("subscriptions").select("*").eq("user_id", user.id).maybeSingle();
      if (subscriptionError) errors.push(`subscription: ${subscriptionError.message}`);
      let transactionSummary = null;
      let environment: Environment | undefined;
      if (body.transaction_id) {
        try {
          const found = await findTransaction(String(body.transaction_id), body.environment as Environment | undefined);
          environment = found.environment;
          transactionSummary = {
            id: found.transaction?.id,
            status: found.transaction?.status,
            subscription_id: found.transaction?.subscription_id || null,
            customer_id: found.transaction?.customer_id || null,
          };
        } catch (error) {
          errors.push(`transaction: ${error instanceof Error ? error.message : "lookup failed"}`);
        }
      }
      return json({ ok: true, health: {
        authenticated: true,
        profileFound: Boolean(profile),
        subscriptionFound: Boolean(subscription),
        sandboxApiConfigured: Boolean(Deno.env.get("PADDLE_SANDBOX_API_KEY")?.trim()),
        productionApiConfigured: Boolean(Deno.env.get("PADDLE_API_KEY")?.trim()),
        environment,
        transaction: transactionSummary,
        errors,
      }});
    }

    const { data: subscriptionRows, error: subscriptionError } = await admin
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", "paddle")
      .order("updated_at", { ascending: false })
      .limit(1);
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
      return json({ ok: true, status: {
        subscription,
        billingEvents: events || [],
        ready,
        syncMessage: ready ? null : "No verified Paddle subscription is stored yet.",
      }});
    }

    if (!subscription?.provider_subscription_id || !subscription?.provider_customer_id) {
      return json({ ok: false, error: "Subscription identifiers are not ready. Complete or re-sync a payment first." }, 409);
    }

    const environment: Environment = subscription.provider_environment === "sandbox" ? "sandbox" : "production";

    if (action === "portal") {
      const result = await paddleRequest(environment, `/customers/${encodeURIComponent(subscription.provider_customer_id)}/portal-sessions`, {
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
      if (!url) throw new Error("Paddle did not return a customer portal URL.");
      return json({ ok: true, url });
    }

    if (action === "cancel") {
      const effectiveFrom = body.effective_from === "immediately" ? "immediately" : "next_billing_period";
      const result = await paddleRequest(environment, `/subscriptions/${encodeURIComponent(subscription.provider_subscription_id)}/cancel`, {
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
      const result = await paddleRequest(environment, `/subscriptions/${encodeURIComponent(subscription.provider_subscription_id)}`, {
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
    console.error("[billing-v2] request failed", message, error);
    return json({ ok: false, error: message }, 400);
  }
});
