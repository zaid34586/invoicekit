import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function encryptionKey() {
  const secret = Deno.env.get("PADDLE_KEY_ENCRYPTION_SECRET");
  if (!secret || secret.length < 32) throw new Error("PADDLE_KEY_ENCRYPTION_SECRET must be at least 32 characters.");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["decrypt"]);
}

async function decrypt(encryptedKey: string, ivValue: string) {
  const key = await encryptionKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivValue) },
    key,
    fromBase64(encryptedKey),
  );
  return decoder.decode(decrypted);
}

// Same environment switch already used correctly by paddle-admin-settings
// and paddle-subscriptions. This was previously hardcoded to production
// only, which silently fails (wrong-environment 401/403) for any account
// still using a Paddle *sandbox* key -- sandbox keys only work against
// sandbox-api.paddle.com, never api.paddle.com.
function paddleBaseUrl() {
  const environment = String(Deno.env.get("PADDLE_ENV") || "production").toLowerCase();
  return environment === "sandbox" ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";
}

async function paddleRequest(apiKey: string, path: string, method = "GET", body?: Record<string, unknown>) {
  const response = await fetch(`${paddleBaseUrl()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let parsed: any = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text }; }
  if (!response.ok) {
    const detail = parsed?.error?.detail || parsed?.error?.code || text || `HTTP ${response.status}`;
    throw new Error(`Paddle ${response.status}: ${String(detail).slice(0, 400)}`);
  }
  return parsed;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let currentOfferId = "";
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) throw new Error("Unauthorized");
    const ownerEmail = (Deno.env.get("RIVOX_OWNER_EMAIL") || "mz7123272@gmail.com").toLowerCase();
    if ((user.email || "").toLowerCase() !== ownerEmail) throw new Error("Owner access required");

    const payload = await req.json().catch(() => ({}));
    const action = String(payload.action || "sync");
    const offerId = String(payload.offer_id || "");
    currentOfferId = offerId;
    if (!offerId) throw new Error("offer_id is required");

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: credential, error: credentialError } = await admin
      .from("admin_paddle_credentials")
      .select("encrypted_key,encryption_iv")
      .eq("id", "primary")
      .single();
    if (credentialError || !credential?.encrypted_key || !credential?.encryption_iv) {
      throw new Error("Save and verify the Paddle API key in Admin → Paddle first.");
    }
    const apiKey = await decrypt(credential.encrypted_key, credential.encryption_iv);

    const { data: offer, error: offerError } = await admin.from("admin_promo_codes").select("*").eq("id", offerId).single();
    if (offerError || !offer) throw new Error("Offer not found");

    if (action === "test") {
      if (!offer.paddle_discount_id) throw new Error("Offer has not been synced to Paddle.");
      const result = await paddleRequest(apiKey, `/discounts/${offer.paddle_discount_id}`);
      return Response.json({ ok: true, discountId: result.data?.id, code: result.data?.code, status: result.data?.status }, { headers: corsHeaders });
    }

    if (action === "archive") {
      if (!offer.paddle_discount_id) throw new Error("Offer has no Paddle discount to archive.");
      const result = await paddleRequest(apiKey, `/discounts/${offer.paddle_discount_id}`, "PATCH", { status: "archived" });
      await admin.from("admin_promo_codes").update({
        paddle_synced: false,
        paddle_sync_status: "archived",
        paddle_last_synced_at: new Date().toISOString(),
        paddle_last_error: null,
        active: false,
        updated_at: new Date().toISOString(),
      }).eq("id", offerId);
      return Response.json({ ok: true, discountId: result.data?.id, status: result.data?.status }, { headers: corsHeaders });
    }

    await admin.from("admin_promo_codes").update({ paddle_sync_status: "syncing", paddle_last_error: null }).eq("id", offerId);

    const restrictTo = Array.isArray(offer.paddle_restrict_to) && offer.paddle_restrict_to.length
      ? offer.paddle_restrict_to
      : null;
    const isFlat = offer.discount_type === "fixed";
    // Paddle's discount schema rejects currency_code as an explicit key
    // (even set to null) when type is "percentage" -- it must be omitted
    // entirely, not just empty. Sending it unconditionally was a likely
    // cause of "Paddle 400: Request does not pass validation."
    const discountPayload: Record<string, unknown> = {
      description: offer.description || offer.label || `Rivox offer ${offer.code}`,
      enabled_for_checkout: Boolean(offer.active),
      code: String(offer.code).replace(/[^a-zA-Z0-9]/g, "").slice(0, 32),
      type: isFlat ? "flat" : "percentage",
      amount: isFlat ? String(Math.round(Number(offer.discount_value) * 100)) : String(Number(offer.discount_value)),
      recur: Boolean(offer.paddle_recur),
      custom_data: { rivox_offer_id: offer.id, applies_to: offer.applies_to, billing_scope: offer.billing_scope },
    };
    if (isFlat) discountPayload.currency_code = offer.paddle_currency_code || "USD";
    if (offer.paddle_recur && offer.paddle_max_recurring_intervals) discountPayload.maximum_recurring_intervals = offer.paddle_max_recurring_intervals;
    if (offer.usage_limit) discountPayload.usage_limit = offer.usage_limit;
    if (restrictTo) discountPayload.restrict_to = restrictTo;
    // A past expires_at is also rejected by Paddle on create/update -- only
    // send it if it's still in the future; an already-expired offer simply
    // won't be resent here (it's inactive/expired locally either way).
    if (offer.expires_at && new Date(offer.expires_at).getTime() > Date.now()) discountPayload.expires_at = offer.expires_at;

    let result;
    if (offer.paddle_discount_id) {
      result = await paddleRequest(apiKey, `/discounts/${offer.paddle_discount_id}`, "PATCH", discountPayload);
    } else {
      try {
        result = await paddleRequest(apiKey, "/discounts", "POST", discountPayload);
      } catch (createError) {
        // A discount with this code can already exist in Paddle from an
        // earlier sync attempt that succeeded on Paddle's side but failed
        // to save the ID back into our DB (e.g. a transient error right
        // after creation). Paddle's 409 conflict message includes the
        // existing discount's ID -- adopt it and PATCH it instead of
        // failing forever on every retry.
        const message = createError instanceof Error ? createError.message : "";
        const conflictMatch = message.match(/Discount ID (dsc_[a-zA-Z0-9_]+)/i);
        if (!conflictMatch) throw createError;
        result = await paddleRequest(apiKey, `/discounts/${conflictMatch[1]}`, "PATCH", discountPayload);
      }
    }

    const discount = result.data;
    await admin.from("admin_promo_codes").update({
      paddle_discount_id: discount.id,
      paddle_synced: true,
      paddle_sync_status: "synced",
      paddle_last_synced_at: new Date().toISOString(),
      paddle_last_error: null,
      usage_count: Number(discount.times_used || offer.usage_count || 0),
      updated_at: new Date().toISOString(),
    }).eq("id", offerId);

    return Response.json({ ok: true, discountId: discount.id, code: discount.code, status: discount.status }, { headers: corsHeaders });
  } catch (error) {
    try {
      if (currentOfferId) {
        const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        await admin.from("admin_promo_codes").update({
          paddle_synced: false,
          paddle_sync_status: "error",
          paddle_last_error: error instanceof Error ? error.message : "Unexpected Paddle sync error",
          updated_at: new Date().toISOString(),
        }).eq("id", currentOfferId);
      }
    } catch { /* best effort */ }
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Unexpected error" }, { status: 400, headers: corsHeaders });
  }
});
