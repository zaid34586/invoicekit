import { createClient } from "@supabase/supabase-js";

const encoder = new TextEncoder();
function hex(bytes: ArrayBuffer) { return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
function safeEqual(a: string, b: string) { if (a.length !== b.length) return false; let value = 0; for (let i = 0; i < a.length; i++) value |= a.charCodeAt(i) ^ b.charCodeAt(i); return value === 0; }
async function verifySignature(rawBody: string, signatureHeader: string, secret: string) {
  const parts = Object.fromEntries(signatureHeader.split(";").map((part) => part.split("=", 2)));
  const timestamp = parts.ts; const signature = parts.h1;
  if (!timestamp || !signature) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}:${rawBody}`));
  return safeEqual(hex(digest), signature);
}

Deno.serve(async (req) => {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("Paddle-Signature") || "";

    // Sandbox and Live are separate Paddle notification destinations, each
    // with its own signing secret. Whichever one verifies tells us which
    // environment this event actually came from — we tag every row we
    // write with that, so a sandbox test payment can never be confused
    // with (or overwrite) a real production subscription.
    const liveSecret = Deno.env.get("PADDLE_WEBHOOK_SECRET") || "";
    const sandboxSecret = Deno.env.get("PADDLE_WEBHOOK_SECRET_SANDBOX") || "";
    let environment: "production" | "sandbox" | null = null;
    if (liveSecret && (await verifySignature(rawBody, signature, liveSecret))) environment = "production";
    else if (sandboxSecret && (await verifySignature(rawBody, signature, sandboxSecret))) environment = "sandbox";
    if (!environment) {
      console.error("paddle-webhook: signature did not match live or sandbox secret");
      return new Response("Invalid signature", { status: 401 });
    }

    const event = JSON.parse(rawBody);
    const data = event.data || {};
    const custom = data.custom_data || {};
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let userId = custom.user_id || custom.userId || null;
    if (!userId && data.id) {
      const { data: existing } = await admin.from("subscriptions").select("user_id").eq("provider_subscription_id", data.id).maybeSingle();
      userId = existing?.user_id || null;
    }
    if (!userId && data.subscription_id) {
      const { data: existing } = await admin.from("subscriptions").select("user_id").eq("provider_subscription_id", data.subscription_id).maybeSingle();
      userId = existing?.user_id || null;
    }
    if (!userId && data.customer_id) {
      const { data: existing } = await admin.from("subscriptions").select("user_id").eq("provider_customer_id", data.customer_id).maybeSingle();
      userId = existing?.user_id || null;
    }

    if (!userId) {
      console.error(`paddle-webhook: could not resolve user_id for ${event.event_type}`, { data_id: data.id, subscription_id: data.subscription_id, customer_id: data.customer_id });
    }

    const plan = custom.plan || "free";
    const billingCycle = custom.billing_cycle || null;

    if (["transaction.completed", "transaction.paid"].includes(event.event_type) && userId) {
      const { error: billingError } = await admin.from("billing_events").upsert({
        provider_event_id: event.event_id,
        user_id: userId,
        provider: "paddle",
        environment,
        event_name: event.event_type,
        order_id: data.id,
        subscription_id: data.subscription_id || null,
        plan,
        billing_cycle: billingCycle,
        amount: Number(data.details?.totals?.grand_total || 0) / 100,
        currency: data.currency_code || null,
        status: data.status || "completed",
        receipt_url: data.checkout?.url || null,
        raw_payload: event,
      }, { onConflict: "provider_event_id" });
      if (billingError) console.error("paddle-webhook: billing_events upsert failed", billingError.message);

      if (data.subscription_id) {
        const { error: subError } = await admin.from("subscriptions").upsert({
          user_id: userId,
          provider: "paddle",
          environment,
          provider_subscription_id: data.subscription_id,
          provider_customer_id: data.customer_id || null,
          plan,
          billing_cycle: billingCycle,
          status: "active",
          currency: data.currency_code || null,
          amount: Number(data.details?.totals?.grand_total || 0) / 100,
          raw_payload: event,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,environment" });
        if (subError) console.error("paddle-webhook: subscriptions upsert failed (transaction path)", subError.message);
      }

      const { error: profileError } = await admin.from("profiles").update({ is_pro: true, plan }).or(`user_id.eq.${userId},id.eq.${userId}`);
      if (profileError) console.error("paddle-webhook: profiles update failed (transaction path)", profileError.message);
    }

    if (String(event.event_type).startsWith("subscription.") && userId) {
      const status = data.status || (event.event_type === "subscription.canceled" ? "canceled" : "active");
      const { error: subError } = await admin.from("subscriptions").upsert({
        user_id: userId,
        provider: "paddle",
        environment,
        provider_subscription_id: data.id,
        provider_customer_id: data.customer_id || null,
        product_id: data.items?.[0]?.price?.product_id || null,
        variant_id: data.items?.[0]?.price?.id || null,
        plan: custom.plan || plan,
        billing_cycle: custom.billing_cycle || billingCycle,
        status,
        currency: data.currency_code || null,
        renews_at: data.next_billed_at || null,
        ends_at: data.scheduled_change?.effective_at || data.canceled_at || null,
        cancelled: status === "canceled" || Boolean(data.scheduled_change?.action === "cancel"),
        raw_payload: event,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,environment" });
      if (subError) console.error("paddle-webhook: subscriptions upsert failed (subscription path)", subError.message);

      const { error: profileError } = await admin.from("profiles").update({ is_pro: status !== "canceled", plan: status === "canceled" ? "free" : (custom.plan || plan) }).or(`user_id.eq.${userId},id.eq.${userId}`);
      if (profileError) console.error("paddle-webhook: profiles update failed (subscription path)", profileError.message);
    }

    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error("paddle-webhook error", error);
    return new Response(error instanceof Error ? error.message : "Webhook error", { status: 400 });
  }
});