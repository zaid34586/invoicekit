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


function renderTemplate(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{{${key}}}`, value), template);
}

async function sendAutomationEmail(to: string, subject: string, body: string) {
  const key = Deno.env.get("RESEND_API_KEY") || "";
  if (!key) return { id: null, skipped: true };
  const from = Deno.env.get("RESEND_FROM_EMAIL") || "Rivox <onboarding@resend.dev>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a"><p>${body.replaceAll("\n", "</p><p>")}</p><p style="font-size:12px;color:#64748b">Rivox Billing</p></div>`,
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.message || "Email delivery failed");
  return { id: payload?.id || null, skipped: false };
}

async function processImmediateAutomation(admin: ReturnType<typeof createClient>, event: any, userId: string, ruleType: "payment_failed" | "subscription_cancelled") {
  const { data: rule } = await admin.from("subscription_automation_rules").select("*").eq("rule_type", ruleType).eq("enabled", true).maybeSingle();
  if (!rule) return;
  const data = event.data || {};
  const { data: profile } = await admin.from("profiles").select("email,business_name").eq("user_id", userId).maybeSingle();
  const { data: subscription } = await admin.from("subscriptions").select("id,plan,customer_email,ends_at,renews_at,amount,currency").eq("user_id", userId).maybeSingle();
  const email = subscription?.customer_email || profile?.email;
  if (!email) return;
  const dedupeKey = `${ruleType}:${event.event_id || data.id}`;
  const values = {
    name: profile?.business_name || "there",
    plan: String(subscription?.plan || data.custom_data?.plan || "paid"),
    date: new Date(subscription?.ends_at || subscription?.renews_at || Date.now()).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    amount: subscription?.amount ? `${subscription.currency || ""} ${subscription.amount}`.trim() : "",
  };
  const subject = renderTemplate(rule.subject_template, values);
  const message = renderTemplate(rule.body_template, values);
  const { data: delivery, error } = await admin.from("subscription_automation_deliveries").insert({
    rule_type: ruleType,
    user_id: userId,
    subscription_id: subscription?.id || null,
    dedupe_key: dedupeKey,
    recipient_email: email,
    status: "pending",
    metadata: { paddle_event_id: event.event_id, subject, message },
  }).select("id").single();
  if (error?.code === "23505") return;
  if (error) throw error;
  try {
    const result = await sendAutomationEmail(email, subject, message);
    await admin.from("subscription_automation_deliveries").update({ status: result.skipped ? "skipped" : "sent", provider_message_id: result.id, sent_at: new Date().toISOString() }).eq("id", delivery.id);
  } catch (sendError) {
    await admin.from("subscription_automation_deliveries").update({ status: "failed", error_message: sendError instanceof Error ? sendError.message : "Delivery failed" }).eq("id", delivery.id);
  }
  await admin.from("notifications").insert({
    audience: "admin",
    type: ruleType,
    title: ruleType === "payment_failed" ? "Paddle payment failed" : "Subscription cancelled",
    body: `${email} · ${values.plan}`,
    metadata: { user_id: userId, paddle_event_id: event.event_id },
  });
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

    if (["transaction.completed", "transaction.payment_failed"].includes(event.event_type) && userId) {
      await admin.from("billing_events").upsert({
        provider_event_id: event.event_id, user_id: userId, provider: "paddle",
        event_name: event.event_type, order_id: data.id, subscription_id: data.subscription_id || null,
        plan, billing_cycle: billingCycle, amount: Number(data.details?.totals?.grand_total || 0) / 100,
        currency: data.currency_code || null, status: data.status || (event.event_type === "transaction.payment_failed" ? "failed" : "completed"), raw_payload: event,
      }, { onConflict: "provider_event_id" });
    }

    if (event.event_type === "transaction.payment_failed" && userId) {
      await processImmediateAutomation(admin, event, userId, "payment_failed");
    }
    if (["subscription.canceled", "subscription.cancelled"].includes(event.event_type) && userId) {
      await processImmediateAutomation(admin, event, userId, "subscription_cancelled");
    }

    return new Response("ok", { status: 200 });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Webhook error", { status: 400 });
  }
});
