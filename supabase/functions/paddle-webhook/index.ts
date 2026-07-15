import { createClient } from "@supabase/supabase-js";

const encoder = new TextEncoder();

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;

  let value = 0;
  for (let index = 0; index < a.length; index += 1) {
    value |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return value === 0;
}

function parsePaddleSignature(signatureHeader: string) {
  let timestamp = "";
  const signatures: string[] = [];

  for (const part of signatureHeader.split(";")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();

    if (key === "ts") timestamp = value;
    if (key === "h1" && value) signatures.push(value);
  }

  return { timestamp, signatures };
}

async function verifySignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
) {
  const normalizedSecret = secret.trim();
  if (!normalizedSecret || !signatureHeader) return false;

  const { timestamp, signatures } = parsePaddleSignature(signatureHeader);
  if (!timestamp || signatures.length === 0) return false;

  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber)) return false;

  // Reject signatures that are unexpectedly old, while allowing Paddle retries.
  if (Math.abs(Date.now() / 1000 - timestampNumber) > 600) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(normalizedSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestamp}:${rawBody}`),
  );

  const expectedSignature = hex(digest);
  return signatures.some((signature) =>
    safeEqual(expectedSignature, signature.toLowerCase())
  );
}

async function assertNoDatabaseError(
  operation: string,
  result: { error: { message?: string } | null },
) {
  if (result.error) {
    const message = result.error.message || "Unknown database error";
    console.error(`[paddle-webhook] ${operation} failed:`, message);
    throw new Error(`${operation} failed: ${message}`);
  }
}

Deno.serve(async (req) => {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("Paddle-Signature") || "";

    const sandboxSecret =
      Deno.env.get("PADDLE_SANDBOX_WEBHOOK_SECRET")?.trim() || "";
    const liveSecret = Deno.env.get("PADDLE_WEBHOOK_SECRET")?.trim() || "";

    const sandboxVerified = sandboxSecret
      ? await verifySignature(rawBody, signature, sandboxSecret)
      : false;

    const liveVerified = !sandboxVerified && liveSecret
      ? await verifySignature(rawBody, signature, liveSecret)
      : false;

    if (!sandboxVerified && !liveVerified) {
      console.error("[paddle-webhook] signature check failed", {
        hasSignatureHeader: Boolean(signature),
        sandboxSecretConfigured: Boolean(sandboxSecret),
        liveSecretConfigured: Boolean(liveSecret),
      });

      return new Response("Invalid signature", { status: 401 });
    }

    const providerEnvironment = sandboxVerified ? "sandbox" : "production";
    const event = JSON.parse(rawBody);
    const data = event.data || {};
    const custom = data.custom_data || {};
    const userId = custom.user_id || custom.userId || null;
    const plan = custom.plan || "free";
    const billingCycle = custom.billing_cycle || null;

    console.log("[paddle-webhook] verified event", {
      eventType: event.event_type,
      eventId: event.event_id,
      providerEnvironment,
      userId,
    });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const eventType = String(event.event_type || "");
    const isSubscriptionEvent = eventType.startsWith("subscription.");
    const isCompletedTransaction = [
      "transaction.completed",
      "transaction.paid",
    ].includes(eventType);

    if (isSubscriptionEvent && userId) {
      const status = data.status ||
        (eventType === "subscription.canceled" ? "canceled" : "active");

      const subscriptionResult = await admin.from("subscriptions").upsert(
        {
          user_id: userId,
          provider: "paddle",
          provider_subscription_id: data.id,
          provider_customer_id: data.customer_id || null,
          product_id: data.items?.[0]?.price?.product_id || null,
          variant_id: data.items?.[0]?.price?.id || null,
          plan,
          billing_cycle: billingCycle,
          status,
          currency: data.currency_code || null,
          renews_at: data.next_billed_at || null,
          ends_at: data.scheduled_change?.effective_at ||
            data.canceled_at ||
            null,
          cancelled: status === "canceled" ||
            Boolean(data.scheduled_change?.action === "cancel"),
          raw_payload: {
            ...event,
            provider_environment: providerEnvironment,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

      await assertNoDatabaseError(
        "subscription upsert",
        subscriptionResult,
      );

      const profileResult = await admin.from("profiles").update({
        plan,
        subscription_status: status,
        paddle_customer_id: data.customer_id || null,
        paddle_subscription_id: data.id,
      }).eq("id", userId);

      await assertNoDatabaseError("profile update", profileResult);
    }

    if (isCompletedTransaction && userId) {
      const billingResult = await admin.from("billing_events").upsert(
        {
          provider_event_id: event.event_id,
          user_id: userId,
          provider: "paddle",
          event_name: eventType,
          order_id: data.id,
          subscription_id: data.subscription_id || null,
          plan,
          billing_cycle: billingCycle,
          amount:
            Number(data.details?.totals?.grand_total || data.details?.totals?.total || 0) /
            100,
          currency: data.currency_code || null,
          status: data.status || "completed",
          raw_payload: {
            ...event,
            provider_environment: providerEnvironment,
          },
        },
        { onConflict: "provider_event_id" },
      );

      await assertNoDatabaseError("billing event upsert", billingResult);

      // Transaction events contain the customer and subscription IDs even
      // before subscription.created is successfully processed. Saving them
      // here prevents the customer portal from remaining stuck in sync state.
      if (data.subscription_id) {
        const subscriptionResult = await admin.from("subscriptions").upsert(
          {
            user_id: userId,
            provider: "paddle",
            provider_subscription_id: data.subscription_id,
            provider_customer_id: data.customer_id || null,
            product_id:
              data.items?.[0]?.price?.product_id ||
              data.details?.line_items?.[0]?.product?.id ||
              null,
            variant_id:
              data.items?.[0]?.price?.id ||
              data.details?.line_items?.[0]?.price_id ||
              null,
            plan,
            billing_cycle: billingCycle,
            status: "active",
            currency: data.currency_code || null,
            renews_at: data.billing_period?.ends_at || null,
            ends_at: null,
            cancelled: false,
            raw_payload: {
              ...event,
              provider_environment: providerEnvironment,
            },
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );

        await assertNoDatabaseError(
          "transaction subscription recovery",
          subscriptionResult,
        );

        const profileResult = await admin.from("profiles").update({
          plan,
          subscription_status: "active",
          paddle_customer_id: data.customer_id || null,
          paddle_subscription_id: data.subscription_id,
        }).eq("id", userId);

        await assertNoDatabaseError(
          "transaction profile recovery",
          profileResult,
        );
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        event_type: eventType,
        environment: providerEnvironment,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("[paddle-webhook] unhandled error:", error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Webhook error",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});
