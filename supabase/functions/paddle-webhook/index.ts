import { createClient } from "@supabase/supabase-js";

const encoder = new TextEncoder();
type Environment = "sandbox" | "production";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function parseSignature(header: string) {
  let timestamp = "";
  const signatures: string[] = [];
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key === "ts") timestamp = value;
    if (key === "h1" && value) signatures.push(value.toLowerCase());
  }
  return { timestamp, signatures };
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return result === 0;
}

async function verify(rawBody: string, header: string, secretValue: string) {
  const secret = secretValue.trim();
  if (!secret) return false;
  const { timestamp, signatures } = parseSignature(header);
  if (!timestamp || signatures.length === 0) return false;
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
  const expected = toHex(digest).toLowerCase();
  return signatures.some((signature) => timingSafeEqual(expected, signature));
}

async function requireNoError(label: string, error: { message?: string } | null) {
  if (error) throw new Error(`${label}: ${error.message || "database operation failed"}`);
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const rawBody = await request.text();
    const signature = request.headers.get("Paddle-Signature") || "";
    const sandboxSecret = Deno.env.get("PADDLE_SANDBOX_WEBHOOK_SECRET") || "";
    const liveSecret = Deno.env.get("PADDLE_WEBHOOK_SECRET") || "";

    let environment: Environment | null = null;
    if (await verify(rawBody, signature, sandboxSecret)) environment = "sandbox";
    else if (await verify(rawBody, signature, liveSecret)) environment = "production";

    if (!environment) {
      console.error("[paddle-webhook] invalid signature", {
        hasSignature: Boolean(signature),
        sandboxSecretPresent: Boolean(sandboxSecret.trim()),
        liveSecretPresent: Boolean(liveSecret.trim()),
      });
      return new Response("Invalid signature", { status: 401 });
    }

    const event = JSON.parse(rawBody);
    const data = event?.data || {};
    const custom = data?.custom_data || {};
    const eventType = String(event?.event_type || "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase service configuration is missing.");
    const admin = createClient(supabaseUrl, serviceRoleKey);

    let userId: string | null = custom.user_id || custom.userId || null;
    const customerEmail = String(custom.customer_email || data?.customer?.email || "").trim().toLowerCase();

    if (!userId && customerEmail) {
      const { data: profileByEmail, error } = await admin
        .from("profiles")
        .select("user_id")
        .ilike("email", customerEmail)
        .maybeSingle();
      await requireNoError("profile email lookup", error);
      userId = profileByEmail?.user_id || null;
    }

    for (const [column, value] of [
      ["provider_subscription_id", data.id || data.subscription_id],
      ["provider_customer_id", data.customer_id],
    ] as const) {
      if (userId || !value) continue;
      const { data: existing, error } = await admin
        .from("subscriptions")
        .select("user_id")
        .eq(column, value)
        .eq("provider_environment", environment)
        .maybeSingle();
      await requireNoError(`subscription ${column} lookup`, error);
      userId = existing?.user_id || null;
    }

    if (!userId) {
      console.error("[paddle-webhook] user could not be resolved", {
        eventType,
        customerEmail,
        subscriptionId: data.id || data.subscription_id || null,
      });
      return json({ ok: false, error: "Unable to resolve Rivox user." }, 422);
    }

    // Repair the profile/auth link whenever a verified Paddle event arrives.
    const { error: profileLinkError } = await admin
      .from("profiles")
      .update({ user_id: userId })
      .ilike("email", customerEmail || "__no_email__");
    await requireNoError("profile identity repair", profileLinkError);

    const plan = String(custom.plan || "pro").toLowerCase();
    const billingCycle = custom.billing_cycle || null;
    const transactionCompleted =
      eventType === "transaction.completed" ||
      eventType === "transaction.paid" ||
      (eventType === "transaction.updated" && data.status === "completed");

    if (transactionCompleted) {
      const { error: billingError } = await admin.from("billing_events").upsert({
        provider_event_id: event.event_id,
        user_id: userId,
        provider: "paddle",
        provider_environment: environment,
        event_name: eventType,
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
      await requireNoError("billing event upsert", billingError);

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
          customer_email: customerEmail || null,
          currency: data.currency_code || null,
          amount: Number(data.details?.totals?.grand_total || 0) / 100,
          cancelled: false,
          raw_payload: event,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
        await requireNoError("transaction subscription upsert", subscriptionError);
      }
    }

    if (eventType.startsWith("subscription.")) {
      const status = String(data.status || (eventType === "subscription.canceled" ? "canceled" : "active"));
      const subscriptionPlan = String(custom.plan || plan || "pro").toLowerCase();
      const { error: subscriptionError } = await admin.from("subscriptions").upsert({
        user_id: userId,
        provider: "paddle",
        provider_environment: environment,
        provider_subscription_id: data.id,
        provider_customer_id: data.customer_id || null,
        product_id: data.items?.[0]?.price?.product_id || null,
        variant_id: data.items?.[0]?.price?.id || null,
        plan: subscriptionPlan,
        billing_cycle: custom.billing_cycle || billingCycle,
        status,
        customer_email: customerEmail || null,
        currency: data.currency_code || null,
        renews_at: data.next_billed_at || null,
        ends_at: data.scheduled_change?.effective_at || data.canceled_at || null,
        cancelled: status === "canceled" || data.scheduled_change?.action === "cancel",
        raw_payload: event,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      await requireNoError("subscription lifecycle upsert", subscriptionError);
    }

    const active = !eventType.includes("canceled") && data.status !== "canceled";
    const profilePlan = active ? plan : "free";
    const { error: profileError } = await admin
      .from("profiles")
      .update({ is_pro: active && profilePlan !== "free", plan: profilePlan, subscription_status: active ? "active" : "cancelled", subscription_id: data.subscription_id || data.id || null })
      .eq("user_id", userId);
    await requireNoError("profile plan update", profileError);

    console.log("[paddle-webhook] processed", { eventType, environment, userId, plan: profilePlan });
    return json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed";
    console.error("[paddle-webhook] failed", message, error);
    return json({ ok: false, error: message }, 500);
  }
});
