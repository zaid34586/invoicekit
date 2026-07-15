import { createClient } from "@supabase/supabase-js";

const encoder = new TextEncoder();
type PaddleEnvironment = "sandbox" | "production";

function toHex(value: ArrayBuffer) {
  return Array.from(new Uint8Array(value)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

async function verify(rawBody: string, header: string, secret: string) {
  const parts = Object.fromEntries(header.split(";").map((part) => part.split("=", 2)));
  const timestamp = parts.ts;
  const received = parts.h1;
  if (!timestamp || !received) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}:${rawBody}`));
  return timingSafeEqual(toHex(signature), received);
}

async function detectEnvironment(rawBody: string, header: string): Promise<PaddleEnvironment | null> {
  // .trim() matters: a trailing newline or space picked up when copy-pasting
  // the secret into Supabase (dashboard textarea or CLI) silently changes
  // the HMAC key and makes every signature fail with no obvious cause.
  const sandboxSecret = (Deno.env.get("PADDLE_SANDBOX_WEBHOOK_SECRET") || "").trim();
  const liveSecret = (Deno.env.get("PADDLE_WEBHOOK_SECRET") || "").trim();
  if (sandboxSecret && await verify(rawBody, header, sandboxSecret)) return "sandbox";
  if (liveSecret && await verify(rawBody, header, liveSecret)) return "production";

  // Every delivery has been failing with "Invalid signature" — this log
  // narrows down WHY without ever printing the secret itself, so it's easy
  // to tell apart the usual causes: (1) the env var isn't set at all, (2)
  // it's set but doesn't match this notification destination's actual
  // secret (e.g. destination was deleted/recreated and the secret
  // rotated), (3) it has the wrong length (truncated/duplicated paste), or
  // (4) the header itself is malformed/missing.
  console.error("paddle-webhook signature check failed", {
    hasSandboxSecret: Boolean(sandboxSecret),
    sandboxSecretLength: sandboxSecret.length,
    sandboxSecretPrefix: sandboxSecret.slice(0, 12),
    hasLiveSecret: Boolean(liveSecret),
    liveSecretLength: liveSecret.length,
    signatureHeaderPresent: Boolean(header),
    signatureHeaderPreview: header ? header.slice(0, 20) : null,
  });
  return null;
}

async function requireSuccess(label: string, request: PromiseLike<{ data: unknown; error: { message?: string } | null }>) {
  const result = await request;
  if (result.error) throw new Error(`${label}: ${result.error.message || "database error"}`);
}

Deno.serve(async (request) => {
  try {
    const rawBody = await request.text();
    const environment = await detectEnvironment(rawBody, request.headers.get("Paddle-Signature") || "");
    if (!environment) return new Response("Invalid signature", { status: 401 });

    const event = JSON.parse(rawBody);
    const data = event.data || {};
    const custom = data.custom_data || {};
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let userId: string | null = custom.user_id || custom.userId || null;
    if (!userId && data.id) {
      const { data: row } = await admin.from("subscriptions").select("user_id").eq("provider_subscription_id", data.id).maybeSingle();
      userId = row?.user_id || null;
    }
    if (!userId && data.subscription_id) {
      const { data: row } = await admin.from("subscriptions").select("user_id").eq("provider_subscription_id", data.subscription_id).maybeSingle();
      userId = row?.user_id || null;
    }
    if (!userId && data.customer_id) {
      const { data: row } = await admin.from("subscriptions").select("user_id").eq("provider_customer_id", data.customer_id).maybeSingle();
      userId = row?.user_id || null;
    }

    console.log("billing-v2 webhook", { event: event.event_type, environment, userId, transaction: data.id, subscription: data.subscription_id || data.id, customer: data.customer_id });
    if (!userId) return new Response("ok", { status: 200 });

    const plan = custom.plan === "business" ? "business" : custom.plan === "pro" ? "pro" : null;
    const cycle = custom.billing_cycle === "yearly" ? "yearly" : custom.billing_cycle === "monthly" ? "monthly" : null;
    const storedPayload = { ...event, _rivox_environment: environment };

    if (["transaction.completed", "transaction.paid"].includes(event.event_type)) {
      await requireSuccess("billing event", admin.from("billing_events").upsert({
        provider_event_id: event.event_id,
        user_id: userId,
        provider: "paddle",
        event_name: event.event_type,
        order_id: data.id || null,
        subscription_id: data.subscription_id || null,
        plan,
        billing_cycle: cycle,
        amount: Number(data.details?.totals?.grand_total || 0) / 100,
        currency: data.currency_code || null,
        status: data.status || "completed",
        receipt_url: data.checkout?.url || null,
        raw_payload: storedPayload,
      }, { onConflict: "provider_event_id" }));

      if (data.subscription_id) {
        await requireSuccess("subscription from transaction", admin.from("subscriptions").upsert({
          user_id: userId,
          provider: "paddle",
          provider_environment: environment,
          provider_subscription_id: data.subscription_id,
          provider_customer_id: data.customer_id || null,
          provider_order_id: data.id || null,
          plan: plan || "pro",
          billing_cycle: cycle,
          status: "active",
          customer_email: custom.customer_email || data.customer?.email || null,
          currency: data.currency_code || null,
          amount: Number(data.details?.totals?.grand_total || 0) / 100,
          cancelled: false,
          raw_payload: storedPayload,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" }));
      }

      await requireSuccess("profile activation", admin.from("profiles").update({ is_pro: true, plan: plan || "pro" }).or(`user_id.eq.${userId},id.eq.${userId}`));
    }

    if (String(event.event_type).startsWith("subscription.")) {
      const status = data.status || (event.event_type === "subscription.canceled" ? "canceled" : "active");
      const activePlan = plan || data.custom_data?.plan || "pro";
      await requireSuccess("subscription lifecycle", admin.from("subscriptions").upsert({
        user_id: userId,
        provider: "paddle",
        provider_environment: environment,
        provider_subscription_id: data.id,
        provider_customer_id: data.customer_id || null,
        product_id: data.items?.[0]?.price?.product_id || null,
        variant_id: data.items?.[0]?.price?.id || null,
        plan: activePlan,
        billing_cycle: cycle || data.custom_data?.billing_cycle || null,
        status,
        currency: data.currency_code || null,
        renews_at: data.next_billed_at || null,
        ends_at: data.scheduled_change?.effective_at || data.canceled_at || null,
        cancelled: status === "canceled" || data.scheduled_change?.action === "cancel",
        raw_payload: storedPayload,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" }));

      const enabled = !["canceled", "paused"].includes(status);
      await requireSuccess("profile lifecycle", admin.from("profiles").update({ is_pro: enabled, plan: enabled ? activePlan : "free" }).or(`user_id.eq.${userId},id.eq.${userId}`));
    }

    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error("billing-v2 webhook failure", error);
    return new Response(error instanceof Error ? error.message : "Webhook failed", { status: 400 });
  }
});
