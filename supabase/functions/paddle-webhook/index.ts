import { createClient } from "@supabase/supabase-js";

import { Environment as PaddleEnvironment, Paddle } from "@paddle/paddle-node-sdk";

type Environment = "sandbox" | "production";

type PaddleEvent = {
  event_id?: string;
  event_type?: string;
  occurred_at?: string;
  data?: Record<string, any>;
};

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyWithOfficialSdk(
  rawBody: string,
  signatureHeader: string,
  environment: Environment,
  secretValue: string,
) {
  const secret = secretValue.trim();
  if (!secret || !signatureHeader) return { ok: false, error: "missing secret or signature" };

  const apiKey = environment === "sandbox"
    ? (Deno.env.get("PADDLE_SANDBOX_API_KEY") || "").trim()
    : (Deno.env.get("PADDLE_API_KEY") || "").trim();

  if (!apiKey) return { ok: false, error: `missing ${environment} API key` };

  try {
    const paddle = new Paddle(apiKey, {
      environment: environment === "sandbox"
        ? PaddleEnvironment.sandbox
        : PaddleEnvironment.production,
    });
    await paddle.webhooks.unmarshal(rawBody, secret, signatureHeader);
    return { ok: true, error: null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function detectEnvironment(rawBody: string, signatureHeader: string): Promise<Environment | null> {
  const sandboxSecret = (Deno.env.get("PADDLE_SANDBOX_WEBHOOK_SECRET") || "").trim();
  const liveSecret = (Deno.env.get("PADDLE_WEBHOOK_SECRET") || "").trim();

  const sandboxResult = await verifyWithOfficialSdk(
    rawBody,
    signatureHeader,
    "sandbox",
    sandboxSecret,
  );
  if (sandboxResult.ok) return "sandbox";

  const liveResult = await verifyWithOfficialSdk(
    rawBody,
    signatureHeader,
    "production",
    liveSecret,
  );
  if (liveResult.ok) return "production";

  const signatureTimestamp = signatureHeader.match(/(?:^|;)ts=([^;]+)/)?.[1] || null;
  const signaturePrefix = signatureHeader.match(/(?:^|;)h1=([^;]+)/)?.[1]?.slice(0, 12) || null;

  console.error("[paddle-webhook] official SDK signature verification failed", {
    signaturePresent: Boolean(signatureHeader),
    signatureTimestamp,
    signaturePrefix,
    rawBodyLength: rawBody.length,
    sandboxSecretPresent: Boolean(sandboxSecret),
    sandboxSecretLength: sandboxSecret.length,
    sandboxSecretDigest: sandboxSecret ? await sha256(sandboxSecret) : null,
    sandboxError: sandboxResult.error,
    liveSecretPresent: Boolean(liveSecret),
    liveSecretLength: liveSecret.length,
    liveSecretDigest: liveSecret ? await sha256(liveSecret) : null,
    liveError: liveResult.error,
  });
  return null;
}

function planFromData(data: Record<string, any>) {
  const custom = data.custom_data || {};
  if (custom.plan === "pro" || custom.plan === "business") return custom.plan;
  return "free";
}

function cycleFromData(data: Record<string, any>) {
  const custom = data.custom_data || {};
  return custom.billing_cycle === "yearly" ? "yearly" : custom.billing_cycle === "monthly" ? "monthly" : null;
}

function isSuccessfulTransaction(eventType: string, data: Record<string, any>) {
  return eventType === "transaction.completed" ||
    eventType === "transaction.paid" ||
    (eventType === "transaction.updated" && data.status === "completed");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const rawBody = await req.text();
    const signatureHeader = req.headers.get("Paddle-Signature") || req.headers.get("paddle-signature") || "";
    const environment = await detectEnvironment(rawBody, signatureHeader);
    if (!environment) return new Response("Invalid signature", { status: 401 });

    const event = JSON.parse(rawBody) as PaddleEvent;
    const eventType = String(event.event_type || "");
    const data = event.data || {};
    const custom = data.custom_data || {};

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase service configuration is missing.");
    const admin = createClient(supabaseUrl, serviceRoleKey);

    let userId = custom.user_id || custom.userId || null;

    if (!userId && data.subscription_id) {
      const { data: existing, error } = await admin
        .from("subscriptions")
        .select("user_id")
        .eq("provider", "paddle")
        .eq("provider_subscription_id", data.subscription_id)
        .maybeSingle();
      if (error) throw new Error(`Subscription lookup failed: ${error.message}`);
      userId = existing?.user_id || null;
    }

    if (!userId && eventType.startsWith("subscription.") && data.id) {
      const { data: existing, error } = await admin
        .from("subscriptions")
        .select("user_id")
        .eq("provider", "paddle")
        .eq("provider_subscription_id", data.id)
        .maybeSingle();
      if (error) throw new Error(`Subscription lookup failed: ${error.message}`);
      userId = existing?.user_id || null;
    }

    if (!userId && data.customer_id) {
      const { data: existing, error } = await admin
        .from("subscriptions")
        .select("user_id")
        .eq("provider", "paddle")
        .eq("provider_customer_id", data.customer_id)
        .maybeSingle();
      if (error) throw new Error(`Customer lookup failed: ${error.message}`);
      userId = existing?.user_id || null;
    }

    if (!userId) {
      console.warn("[paddle-webhook] event ignored because user could not be resolved", {
        eventType,
        eventId: event.event_id,
        transactionId: data.id,
        subscriptionId: data.subscription_id,
        customerId: data.customer_id,
      });
      return new Response("ok", { status: 200 });
    }

    const plan = planFromData(data);
    const billingCycle = cycleFromData(data);
    const rawPayload = { ...event, _rivox_environment: environment };

    if (isSuccessfulTransaction(eventType, data)) {
      const amount = Number(data.details?.totals?.grand_total || 0) / 100;
      const { error: billingError } = await admin.from("billing_events").upsert({
        provider_event_id: event.event_id || `${eventType}:${data.id}`,
        user_id: userId,
        provider: "paddle",
        provider_environment: environment,
        event_name: eventType,
        order_id: data.id || null,
        subscription_id: data.subscription_id || null,
        plan,
        billing_cycle: billingCycle,
        amount,
        currency: data.currency_code || null,
        status: data.status || "completed",
        receipt_url: data.checkout?.url || null,
        raw_payload: rawPayload,
      }, { onConflict: "provider_event_id" });
      if (billingError) throw new Error(`Billing event upsert failed: ${billingError.message}`);

      if (data.subscription_id) {
        const { error: subscriptionError } = await admin.from("subscriptions").upsert({
          user_id: userId,
          provider: "paddle",
          provider_environment: environment,
          provider_subscription_id: data.subscription_id,
          provider_customer_id: data.customer_id || null,
          provider_order_id: data.id || null,
          plan,
          billing_cycle: billingCycle,
          status: "active",
          currency: data.currency_code || null,
          amount,
          renews_at: data.billing_period?.ends_at || null,
          cancelled: false,
          raw_payload: rawPayload,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
        if (subscriptionError) throw new Error(`Subscription upsert failed: ${subscriptionError.message}`);
      }

      const { error: profileError } = await admin
        .from("profiles")
        .update({ is_pro: true, plan })
        .or(`user_id.eq.${userId},id.eq.${userId}`);
      if (profileError) throw new Error(`Profile update failed: ${profileError.message}`);
    }

    if (eventType.startsWith("subscription.")) {
      const status = data.status || (eventType === "subscription.canceled" ? "canceled" : "active");
      const cancelled = status === "canceled" || data.scheduled_change?.action === "cancel";
      const subscriptionPlan = plan === "free"
        ? (data.custom_data?.plan || "pro")
        : plan;

      const { error: subscriptionError } = await admin.from("subscriptions").upsert({
        user_id: userId,
        provider: "paddle",
        provider_environment: environment,
        provider_subscription_id: data.id || data.subscription_id || null,
        provider_customer_id: data.customer_id || null,
        product_id: data.items?.[0]?.price?.product_id || null,
        variant_id: data.items?.[0]?.price?.id || null,
        plan: subscriptionPlan,
        billing_cycle: billingCycle,
        status,
        currency: data.currency_code || null,
        renews_at: data.next_billed_at || null,
        ends_at: data.scheduled_change?.effective_at || data.canceled_at || null,
        cancelled,
        raw_payload: rawPayload,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (subscriptionError) throw new Error(`Subscription lifecycle upsert failed: ${subscriptionError.message}`);

      const active = status !== "canceled";
      const { error: profileError } = await admin
        .from("profiles")
        .update({ is_pro: active, plan: active ? subscriptionPlan : "free" })
        .or(`user_id.eq.${userId},id.eq.${userId}`);
      if (profileError) throw new Error(`Profile lifecycle update failed: ${profileError.message}`);
    }

    console.log("[paddle-webhook] processed", {
      eventType,
      eventId: event.event_id,
      environment,
      userId,
    });
    return new Response("ok", { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook error";
    console.error("[paddle-webhook] processing failed", message, error);
    return new Response(message, { status: 500 });
  }
});
