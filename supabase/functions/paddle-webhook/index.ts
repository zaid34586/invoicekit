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

function log(label: string, details: Record<string, unknown> = {}) {
  console.log(`[paddle-webhook] ${label}`, details);
}

function logError(label: string, details: Record<string, unknown> = {}) {
  console.error(`[paddle-webhook] ${label}`, details);
}

// Mirrors the profile-sync logic already used in the sandbox paddle-webhook:
// keeps profiles.plan / is_pro / subscription_status / plan_expires_at in
// step with what we just wrote to subscriptions/billing_events, since that is
// what the rest of the app (Billing.tsx, UpgradeContext) actually reads from.
async function syncProfilePlan(
  admin: ReturnType<typeof createClient>,
  userId: string,
  options: { plan: string; isActive: boolean; subscriptionStatus: string; planExpiresAt: string | null },
  context: Record<string, unknown>,
) {
  const profilePlan = options.isActive ? options.plan : "free";
  const { error } = await admin
    .from("profiles")
    .update({
      plan: profilePlan,
      is_pro: options.isActive && profilePlan !== "free",
      subscription_status: options.subscriptionStatus,
      plan_expires_at: options.planExpiresAt,
    })
    .eq("user_id", userId);
  if (error) {
    logError("db update failed: profiles plan sync", { userId, profilePlan, ...context, message: error.message });
    return false;
  }
  log("profiles plan synced", { userId, profilePlan, isPro: options.isActive && profilePlan !== "free", ...context });
  return true;
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
  // (a) Request reached the handler.
  log("request reached handler", { method: req.method, hasSignatureHeader: req.headers.has("Paddle-Signature") });

  try {
    const rawBody = await req.text();
    const signature = req.headers.get("Paddle-Signature") || "";
    const productionSecret = Deno.env.get("PADDLE_WEBHOOK_SECRET") || "";
    const sandboxSecret = Deno.env.get("PADDLE_SANDBOX_WEBHOOK_SECRET") || "";
    const productionValid = Boolean(productionSecret) && (await verifySignature(rawBody, signature, productionSecret));
    const sandboxValid = !productionValid && Boolean(sandboxSecret) && (await verifySignature(rawBody, signature, sandboxSecret));
    const signatureValid = productionValid || sandboxValid;

    if (!signatureValid) {
      // (b) Signature verification failed.
      logError("signature verification failed", {
        hasSecretConfigured: Boolean(productionSecret || sandboxSecret),
        hasSignatureHeader: Boolean(signature),
      });
      return new Response("Invalid signature", { status: 401 });
    }

    const event = JSON.parse(rawBody);
    const data = event.data || {};
    const custom = data.custom_data || {};
    const userId = custom.user_id || data.custom_data?.userId;
    const plan = custom.plan || "free";
    const billingCycle = custom.billing_cycle || null;
    const eventType = String(event.event_type);
    const environment = sandboxValid || custom.environment === "sandbox" ? "sandbox" : "production";

    log("event parsed", { eventType, userId: userId || null, plan, eventId: event.event_id || null });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let subscriptionStatus: string | null = null;

    if (eventType.startsWith("subscription.") && userId) {
      const status = data.status || (eventType === "subscription.canceled" ? "canceled" : "active");
      subscriptionStatus = status;
      const { error: subscriptionError } = await admin.from("subscriptions").upsert({
        user_id: userId, provider: "paddle", provider_subscription_id: data.id,
        provider_customer_id: data.customer_id || null, product_id: data.items?.[0]?.price?.product_id || null,
        variant_id: data.items?.[0]?.price?.id || null, plan, billing_cycle: billingCycle,
        status, currency: data.currency_code || null, renews_at: data.next_billed_at || null,
        ends_at: data.scheduled_change?.effective_at || data.canceled_at || null,
        cancelled: status === "canceled" || Boolean(data.scheduled_change?.action === "cancel"),
        provider_environment: environment,
        billing_provider: "paddle",
        raw_payload: event, updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,provider_environment" });
      // (c) DB update failed.
      if (subscriptionError) {
        logError("db update failed: subscriptions upsert", { eventType, userId, message: subscriptionError.message });
      } else {
        log("subscriptions upserted", { eventType, userId, status });
      }

      const isActive = status === "active" || status === "trialing";
      await syncProfilePlan(
        admin,
        userId,
        { plan, isActive, subscriptionStatus: status, planExpiresAt: data.next_billed_at || data.scheduled_change?.effective_at || null },
        { eventType },
      );
    }

    if (["transaction.completed", "transaction.payment_failed"].includes(eventType) && userId) {
      const status = data.status || (eventType === "transaction.payment_failed" ? "failed" : "completed");
      const { error: billingError } = await admin.from("billing_events").upsert({
        provider_event_id: event.event_id, user_id: userId, provider: "paddle",
        provider_environment: environment,
        event_name: eventType, order_id: data.id, subscription_id: data.subscription_id || null,
        plan, billing_cycle: billingCycle, amount: Number(data.details?.totals?.grand_total || 0) / 100,
        currency: data.currency_code || null, status, raw_payload: event,
      }, { onConflict: "provider_event_id" });
      // (c) DB update failed.
      if (billingError) {
        logError("db update failed: billing_events upsert", { eventType, userId, message: billingError.message });
      } else {
        log("billing_events upserted", { eventType, userId, status });
      }

      if (eventType === "transaction.completed") {
        const validPlan = plan === "pro" || plan === "business";
        if (validPlan && data.subscription_id && data.customer_id) {
          const activationPayload = {
            user_id: userId,
            environment,
            transaction_id: data.id,
            subscription_id: data.subscription_id,
            customer_id: data.customer_id,
            plan,
            billing_cycle: billingCycle,
            status: "active",
            currency: data.currency_code || null,
            amount: Number(data.details?.totals?.grand_total || 0) / 100,
            customer_email: custom.customer_email || null,
            renews_at: data.billing_period?.ends_at || null,
            product_id: data.items?.[0]?.price?.product_id || null,
            price_id: data.items?.[0]?.price?.id || null,
            raw_payload: data,
          };
          const { error: activationError } = await admin.rpc("activate_paddle_transaction_v4", { p_payload: activationPayload });
          if (activationError) {
            logError("atomic transaction activation failed", { userId, transactionId: data.id, message: activationError.message });
          } else {
            await admin.from("billing_activation_incidents").update({
              status: "activated",
              paddle_status: "completed",
              activated_at: new Date().toISOString(),
              resolved_at: new Date().toISOString(),
              error_message: null,
              updated_at: new Date().toISOString(),
            }).eq("transaction_id", data.id).eq("provider_environment", environment);
          }
        } else {
          await syncProfilePlan(
            admin,
            userId,
            { plan, isActive: validPlan, subscriptionStatus: subscriptionStatus || "active", planExpiresAt: data.billing_period?.ends_at || null },
            { eventType },
          );
        }

        // Record the redemption (enforces one-time-per-user via the unique
        // constraint) and mark this user as having held a paid plan, so a
        // "new users only" offer won't be offered to them again.
        if (custom.offer_id) {
          const { error: redemptionError } = await admin.from("admin_offer_redemptions").insert({
            offer_id: custom.offer_id,
            user_id: userId,
            transaction_id: data.id,
          });
          if (redemptionError && redemptionError.code !== "23505") {
            logError("db update failed: admin_offer_redemptions insert", { eventType, userId, message: redemptionError.message });
          }
        }
        if (validPlan) {
          await admin.from("profiles").update({ has_ever_subscribed: true }).or(`user_id.eq.${userId},id.eq.${userId}`);
        }
      }
    }

    if (eventType === "transaction.payment_failed" && userId) {
      await processImmediateAutomation(admin, event, userId, "payment_failed");
    }
    if (["subscription.canceled", "subscription.cancelled"].includes(eventType) && userId) {
      await processImmediateAutomation(admin, event, userId, "subscription_cancelled");
    }

    return new Response("ok", { status: 200 });
  } catch (error) {
    logError("webhook processing error", { message: error instanceof Error ? error.message : String(error) });
    return new Response(error instanceof Error ? error.message : "Webhook error", { status: 400 });
  }
});
