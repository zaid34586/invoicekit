import { createClient } from "@supabase/supabase-js";

const encoder = new TextEncoder();

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let value = 0;
  for (let i = 0; i < a.length; i++) value |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return value === 0;
}

async function verifySignature(rawBody: string, signatureHeader: string, secret: string) {
  const parts = Object.fromEntries(signatureHeader.split(";").map((part) => part.split("=", 2)));
  const timestamp = parts.ts;
  const signature = parts.h1;
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
    const secret = Deno.env.get("PADDLE_WEBHOOK_SECRET") || "";
    if (!secret || !(await verifySignature(rawBody, signature, secret))) return new Response("Invalid signature", { status: 401 });

    const event = JSON.parse(rawBody);
    const data = event.data || {};
    const custom = data.custom_data || {};
    const userId = custom.user_id || data.custom_data?.userId;
    const plan = custom.plan || "free";
    const billingCycle = custom.billing_cycle || null;

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    if (String(event.event_type).startsWith("subscription.") && userId) {
      const status = data.status || (event.event_type === "subscription.canceled" ? "canceled" : "active");
      await admin.from("subscriptions").upsert({
        user_id: userId, provider: "paddle", provider_subscription_id: data.id,
        provider_customer_id: data.customer_id || null, product_id: data.items?.[0]?.price?.product_id || null,
        variant_id: data.items?.[0]?.price?.id || null, plan, billing_cycle: billingCycle,
        status, currency: data.currency_code || null, renews_at: data.next_billed_at || null,
        ends_at: data.scheduled_change?.effective_at || data.canceled_at || null,
        cancelled: status === "canceled" || Boolean(data.scheduled_change?.action === "cancel"),
        raw_payload: event, updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    }

    if (event.event_type === "transaction.completed" && userId) {
      const amount = Number(data.details?.totals?.grand_total || 0) / 100;
      const discountAmount = Number(data.details?.totals?.discount || 0) / 100;
      const offerId = custom.offer_id || null;
      const paddleDiscountId = data.discount_id || custom.paddle_discount_id || null;

      await admin.from("billing_events").upsert({
        provider_event_id: event.event_id, user_id: userId, provider: "paddle",
        event_name: event.event_type, order_id: data.id, subscription_id: data.subscription_id || null,
        plan, billing_cycle: billingCycle, amount,
        currency: data.currency_code || null, status: data.status || "completed", raw_payload: event,
      }, { onConflict: "provider_event_id" });

      if (offerId || paddleDiscountId) {
        let resolvedOfferId = offerId;
        if (!resolvedOfferId && paddleDiscountId) {
          const { data: matched } = await admin.from("admin_promo_codes").select("id").eq("paddle_discount_id", paddleDiscountId).maybeSingle();
          resolvedOfferId = matched?.id || null;
        }

        await admin.from("offer_redemptions").upsert({
          offer_id: resolvedOfferId,
          provider: "paddle",
          provider_event_id: event.event_id,
          provider_transaction_id: data.id,
          provider_subscription_id: data.subscription_id || null,
          paddle_discount_id: paddleDiscountId,
          user_id: userId,
          plan,
          billing_cycle: billingCycle,
          amount,
          discount_amount: discountAmount,
          currency: data.currency_code || null,
          status: data.status || "completed",
          metadata: { offer_code: custom.offer_code || null, raw_custom_data: custom },
        }, { onConflict: "provider_event_id" });

        if (resolvedOfferId) {
          const { data: currentOffer } = await admin.from("admin_promo_codes").select("usage_count").eq("id", resolvedOfferId).single();
          await admin.from("admin_promo_codes").update({
            usage_count: Number(currentOffer?.usage_count || 0) + 1,
            updated_at: new Date().toISOString(),
          }).eq("id", resolvedOfferId);
        }

        await admin.from("growth_events").insert({
          event_name: "checkout_success",
          offer_id: resolvedOfferId,
          plan,
          billing_cycle: billingCycle,
          amount,
          metadata: { transaction_id: data.id, discount_id: paddleDiscountId, discount_amount: discountAmount },
        });
      }
    }

    return new Response("ok", { status: 200 });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Webhook error", { status: 400 });
  }
});
