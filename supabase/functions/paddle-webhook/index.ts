import { createClient } from "@supabase/supabase-js";

const encoder = new TextEncoder();

type PaddleEnvironment = "sandbox" | "production";

type PaddleEvent = {
  event_id?: string;
  event_type?: string;
  occurred_at?: string;
  data?: Record<string, any>;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function toHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

function parsePaddleSignature(header: string) {
  let timestamp = "";
  const signatures: string[] = [];
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key === "ts") timestamp = value;
    if (key === "h1" && value) signatures.push(value);
  }
  return { timestamp, signatures };
}

async function verifySignature(rawBody: string, signatureHeader: string, secretValue: string) {
  const secret = secretValue.trim();
  const { timestamp, signatures } = parsePaddleSignature(signatureHeader);
  if (!secret || !timestamp || signatures.length === 0) return false;
  if (!/^\d+$/.test(timestamp)) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestamp}:${rawBody}`),
  );
  const expected = toHex(digest);
  return signatures.some((signature) => constantTimeEqual(expected, signature));
}

async function resolveEnvironment(rawBody: string, signatureHeader: string) {
  const sandboxSecret = Deno.env.get("PADDLE_SANDBOX_WEBHOOK_SECRET")?.trim() || "";
  const liveSecret = Deno.env.get("PADDLE_WEBHOOK_SECRET")?.trim() || "";

  if (sandboxSecret && await verifySignature(rawBody, signatureHeader, sandboxSecret)) {
    return "sandbox" as const;
  }
  if (liveSecret && await verifySignature(rawBody, signatureHeader, liveSecret)) {
    return "production" as const;
  }

  const parsed = parsePaddleSignature(signatureHeader);
  console.error("[paddle-webhook] signature verification failed", {
    signatureHeaderPresent: Boolean(signatureHeader),
    timestampPresent: Boolean(parsed.timestamp),
    signatureCount: parsed.signatures.length,
    sandboxSecretPresent: Boolean(sandboxSecret),
    sandboxSecretLength: sandboxSecret.length,
    liveSecretPresent: Boolean(liveSecret),
    liveSecretLength: liveSecret.length,
    bodyLength: rawBody.length,
  });
  return null;
}

function getPlan(customData: Record<string, any>, data: Record<string, any>) {
  const explicit = String(customData.plan || "").toLowerCase();
  if (explicit === "pro" || explicit === "business") return explicit;
  const productName = String(data.items?.[0]?.price?.name || data.items?.[0]?.product?.name || "").toLowerCase();
  if (productName.includes("business")) return "business";
  if (productName.includes("pro")) return "pro";
  return "free";
}

function getBillingCycle(customData: Record<string, any>, data: Record<string, any>) {
  if (customData.billing_cycle) return String(customData.billing_cycle);
  const interval = data.items?.[0]?.price?.billing_cycle?.interval;
  return interval === "year" ? "yearly" : interval === "month" ? "monthly" : null;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const rawBody = await request.text();
  const signatureHeader = request.headers.get("paddle-signature") || "";
  const environment = await resolveEnvironment(rawBody, signatureHeader);
  if (!environment) return json({ ok: false, error: "Invalid signature" }, 401);

  try {
    const event = JSON.parse(rawBody) as PaddleEvent;
    const eventType = String(event.event_type || "");
    const data = event.data || {};
    const customData = data.custom_data || {};

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Supabase service configuration is missing.");
    }
    const admin = createClient(supabaseUrl, serviceRoleKey);

    let userId = customData.user_id || customData.userId || null;
    const providerSubscriptionId = data.subscription_id || (eventType.startsWith("subscription.") ? data.id : null);
    const providerCustomerId = data.customer_id || null;

    if (!userId && providerSubscriptionId) {
      const { data: existing, error } = await admin
        .from("subscriptions")
        .select("user_id")
        .eq("provider_subscription_id", providerSubscriptionId)
        .maybeSingle();
      if (error) throw new Error(`Subscription user lookup failed: ${error.message}`);
      userId = existing?.user_id || null;
    }
    if (!userId && providerCustomerId) {
      const { data: existing, error } = await admin
        .from("subscriptions")
        .select("user_id")
        .eq("provider_customer_id", providerCustomerId)
        .maybeSingle();
      if (error) throw new Error(`Customer user lookup failed: ${error.message}`);
      userId = existing?.user_id || null;
    }

    if (!userId) {
      console.error("[paddle-webhook] user could not be resolved", {
        eventType,
        eventId: event.event_id,
        providerSubscriptionId,
        providerCustomerId,
      });
      return json({ ok: false, error: "User could not be resolved" }, 422);
    }

    const plan = getPlan(customData, data);
    const billingCycle = getBillingCycle(customData, data);
    const isCompletedTransaction =
      eventType === "transaction.completed" ||
      eventType === "transaction.paid" ||
      (eventType === "transaction.updated" && data.status === "completed");

    if (isCompletedTransaction) {
      const { error: billingError } = await admin.from("billing_events").upsert({
        provider_event_id: event.event_id,
        user_id: userId,
        provider: "paddle",
        provider_environment: environment,
        event_name: eventType,
        order_id: data.id || null,
        subscription_id: providerSubscriptionId,
        plan,
        billing_cycle: billingCycle,
        amount: Number(data.details?.totals?.grand_total || 0) / 100,
        currency: data.currency_code || null,
        status: data.status || "completed",
        receipt_url: data.checkout?.url || null,
        raw_payload: { ...event, _rivox_environment: environment },
      }, { onConflict: "provider_event_id" });
      if (billingError) throw new Error(`Billing event write failed: ${billingError.message}`);

      if (providerSubscriptionId) {
        const { error: subscriptionError } = await admin.from("subscriptions").upsert({
          user_id: userId,
          provider: "paddle",
          provider_environment: environment,
          provider_subscription_id: providerSubscriptionId,
          provider_customer_id: providerCustomerId,
          provider_order_id: data.id || null,
          plan,
          billing_cycle: billingCycle,
          status: "active",
          customer_email: customData.customer_email || null,
          currency: data.currency_code || null,
          amount: Number(data.details?.totals?.grand_total || 0) / 100,
          renews_at: data.billing_period?.ends_at || null,
          cancelled: false,
          raw_payload: { ...event, _rivox_environment: environment },
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
        if (subscriptionError) throw new Error(`Subscription write failed: ${subscriptionError.message}`);
      }

      const { error: profileError } = await admin
        .from("profiles")
        .update({ is_pro: plan !== "free", plan })
        .or(`user_id.eq.${userId},id.eq.${userId}`);
      if (profileError) throw new Error(`Profile activation failed: ${profileError.message}`);
    }

    if (eventType.startsWith("subscription.")) {
      const status = String(data.status || (eventType === "subscription.canceled" ? "canceled" : "active"));
      const canceled = status === "canceled" || data.scheduled_change?.action === "cancel";
      const { error: subscriptionError } = await admin.from("subscriptions").upsert({
        user_id: userId,
        provider: "paddle",
        provider_environment: environment,
        provider_subscription_id: data.id,
        provider_customer_id: providerCustomerId,
        product_id: data.items?.[0]?.price?.product_id || null,
        variant_id: data.items?.[0]?.price?.id || null,
        plan,
        billing_cycle: billingCycle,
        status,
        currency: data.currency_code || null,
        renews_at: data.next_billed_at || null,
        ends_at: data.scheduled_change?.effective_at || data.canceled_at || null,
        cancelled: canceled,
        raw_payload: { ...event, _rivox_environment: environment },
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (subscriptionError) throw new Error(`Subscription lifecycle write failed: ${subscriptionError.message}`);

      const activePlan = status === "canceled" ? "free" : plan;
      const { error: profileError } = await admin
        .from("profiles")
        .update({ is_pro: activePlan !== "free", plan: activePlan })
        .or(`user_id.eq.${userId},id.eq.${userId}`);
      if (profileError) throw new Error(`Profile lifecycle update failed: ${profileError.message}`);
    }

    console.log("[paddle-webhook] processed", {
      eventType,
      eventId: event.event_id,
      environment,
      userId,
      plan,
      providerSubscriptionId,
    });
    return json({ ok: true }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed";
    console.error("[paddle-webhook] processing failed", { message });
    return json({ ok: false, error: message }, 500);
  }
});
