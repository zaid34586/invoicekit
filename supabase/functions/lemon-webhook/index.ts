import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function hex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function verifySignature(rawBody: string, received: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)));
  if (expected.length !== received.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ received.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const rawBody = await req.text();
  const signature = req.headers.get("X-Signature") || "";
  const eventName = req.headers.get("X-Event-Name") || "unknown";
  const secret = Deno.env.get("LEMON_SQUEEZY_WEBHOOK_SECRET") || "";
  if (!secret || !(await verifySignature(rawBody, signature, secret))) {
    return json({ error: "Invalid webhook signature" }, 401);
  }

  try {
    const payload = JSON.parse(rawBody);
    const data = payload?.data;
    const attributes = data?.attributes || {};
    const custom = payload?.meta?.custom_data || attributes?.custom_data || {};
    const userId = custom.user_id as string | undefined;
    if (!userId) return json({ received: true, ignored: "No user_id in custom data" });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const status = String(attributes.status || "active");
    const endsAt = attributes.ends_at || null;
    const renewsAt = attributes.renews_at || null;
    const plan = custom.plan === "business" ? "business" : "pro";
    const billingCycle = custom.billing_cycle === "monthly" ? "monthly" : "yearly";
    const subscriptionId = String(data?.id || attributes.subscription_id || "");
    const accessContinuesAfterCancel = status === "cancelled" && endsAt && new Date(endsAt).getTime() > Date.now();
    const hasAccess = ["active", "on_trial", "paused", "past_due"].includes(status) || Boolean(accessContinuesAfterCancel);

    if (eventName.startsWith("subscription_")) {
      const row = {
        user_id: userId,
        provider: "lemon_squeezy",
        provider_subscription_id: subscriptionId || null,
        provider_customer_id: attributes.customer_id ? String(attributes.customer_id) : null,
        provider_order_id: attributes.order_id ? String(attributes.order_id) : null,
        product_id: attributes.product_id ? String(attributes.product_id) : null,
        variant_id: attributes.variant_id ? String(attributes.variant_id) : null,
        plan,
        billing_cycle: billingCycle,
        status,
        customer_email: attributes.user_email || attributes.customer_email || null,
        currency: attributes.currency || null,
        amount: attributes.total ?? attributes.subtotal ?? null,
        renews_at: renewsAt,
        ends_at: endsAt,
        trial_ends_at: attributes.trial_ends_at || null,
        cancelled: Boolean(attributes.cancelled || status === "cancelled"),
        raw_payload: payload,
        updated_at: new Date().toISOString(),
      };

      const { error: subError } = await supabase.from("subscriptions").upsert(row, { onConflict: "user_id" });
      if (subError) throw subError;

      const { error: profileError } = await supabase.from("profiles").update({
        plan: hasAccess ? plan : "free",
        is_pro: hasAccess,
        subscription_status: hasAccess ? "active" : status === "expired" ? "expired" : "cancelled",
        subscription_id: subscriptionId || null,
        plan_expires_at: endsAt || renewsAt,
      }).eq("id", userId);
      if (profileError) throw profileError;
    }

    if (["order_created", "subscription_payment_success", "subscription_payment_failed", "subscription_payment_refunded"].includes(eventName)) {
      const orderId = String(data?.id || attributes.order_id || crypto.randomUUID());
      await supabase.from("billing_events").upsert({
        provider_event_id: `${eventName}:${orderId}`,
        user_id: userId,
        provider: "lemon_squeezy",
        event_name: eventName,
        order_id: orderId,
        subscription_id: subscriptionId || null,
        plan,
        billing_cycle: billingCycle,
        amount: attributes.total ?? attributes.subtotal ?? 0,
        currency: attributes.currency || null,
        status: attributes.status || (eventName.includes("failed") ? "failed" : "paid"),
        receipt_url: attributes.urls?.receipt || attributes.receipt_url || null,
        raw_payload: payload,
      }, { onConflict: "provider_event_id" });
    }

    return json({ received: true });
  } catch (error) {
    console.error("Webhook processing failed", error);
    return json({ error: error instanceof Error ? error.message : "Webhook processing failed" }, 500);
  }
});
