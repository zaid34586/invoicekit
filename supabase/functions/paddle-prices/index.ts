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

async function paddleRequest(apiKey: string, path: string, method = "GET", body?: Record<string, unknown>) {
  const response = await fetch(`https://api.paddle.com${path}`, {
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

// admin_pricing_plans.yearly_price is the monthly-equivalent rate shown on
// the yearly toggle (matches src/lib/pricing.ts's yearlyMonthlyPrice and
// Billing.tsx's getAnnualTotal = yearlyMonthlyPrice * 12) -- so the actual
// amount Paddle should charge once a year is yearly_price * 12, not
// yearly_price itself.
function minorUnits(amount: number) {
  return String(Math.round(Number(amount) * 100));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let currentPlanId = "";
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
    const planId = String(payload.plan_id || "");
    currentPlanId = planId;
    if (!planId) throw new Error("plan_id is required");

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: credential, error: credentialError } = await admin
      .from("admin_paddle_credentials")
      .select("encrypted_key,encryption_iv")
      .eq("id", "primary")
      .single();
    if (credentialError || !credential?.encrypted_key || !credential?.encryption_iv) {
      throw new Error("Save and verify the Paddle API key in Admin \u2192 Paddle first.");
    }
    const apiKey = await decrypt(credential.encrypted_key, credential.encryption_iv);

    const { data: plan, error: planError } = await admin.from("admin_pricing_plans").select("*").eq("id", planId).single();
    if (planError || !plan) throw new Error("Plan not found");
    if (plan.plan_key === "free") throw new Error("The Free plan has no price to sync with Paddle.");

    if (action === "test") {
      if (!plan.paddle_monthly_price_id && !plan.paddle_yearly_price_id) throw new Error("This plan has not been synced to Paddle yet.");
      const [monthly, yearly] = await Promise.all([
        plan.paddle_monthly_price_id ? paddleRequest(apiKey, `/prices/${plan.paddle_monthly_price_id}`) : null,
        plan.paddle_yearly_price_id ? paddleRequest(apiKey, `/prices/${plan.paddle_yearly_price_id}`) : null,
      ]);
      return Response.json({
        ok: true,
        monthly: monthly ? { id: monthly.data?.id, amount: monthly.data?.unit_price?.amount, currency: monthly.data?.unit_price?.currency_code, status: monthly.data?.status } : null,
        yearly: yearly ? { id: yearly.data?.id, amount: yearly.data?.unit_price?.amount, currency: yearly.data?.unit_price?.currency_code, status: yearly.data?.status } : null,
      }, { headers: corsHeaders });
    }

    await admin.from("admin_pricing_plans").update({ paddle_sync_status: "syncing", paddle_last_error: null }).eq("id", planId);

    const currency = String(plan.currency || "USD").toUpperCase();

    // 1. Product (one per plan_key + region). Paddle products can't change
    // currency after creation, so a distinct product per region is correct.
    let productId = plan.paddle_product_id as string | null;
    const productPayload = {
      name: `Rivox ${plan.name} (${plan.region === "india" ? "India" : "Global"})`,
      tax_category: "standard",
      custom_data: { rivox_plan_key: plan.plan_key, rivox_region: plan.region },
    };
    if (productId) {
      await paddleRequest(apiKey, `/products/${productId}`, "PATCH", productPayload);
    } else {
      const created = await paddleRequest(apiKey, "/products", "POST", productPayload);
      productId = created.data?.id;
    }
    if (!productId) throw new Error("Paddle did not return a product id.");

    // 2. Monthly recurring price.
    const monthlyPayload = {
      description: `${plan.name} monthly (${plan.region})`,
      product_id: productId,
      unit_price: { amount: minorUnits(plan.monthly_price), currency_code: currency },
      billing_cycle: { interval: "month", frequency: 1 },
      quantity: { minimum: 1, maximum: 1 },
      custom_data: { rivox_plan_key: plan.plan_key, rivox_region: plan.region, rivox_cycle: "monthly" },
    };
    let monthlyPriceId = plan.paddle_monthly_price_id as string | null;
    if (monthlyPriceId) {
      await paddleRequest(apiKey, `/prices/${monthlyPriceId}`, "PATCH", { description: monthlyPayload.description, unit_price: monthlyPayload.unit_price, custom_data: monthlyPayload.custom_data });
    } else {
      const created = await paddleRequest(apiKey, "/prices", "POST", monthlyPayload);
      monthlyPriceId = created.data?.id;
    }

    // 3. Yearly recurring price -- charged once a year, so the amount is the
    // monthly-equivalent rate times 12 (see minorUnits comment above).
    const yearlyPayload = {
      description: `${plan.name} yearly (${plan.region})`,
      product_id: productId,
      unit_price: { amount: minorUnits(Number(plan.yearly_price) * 12), currency_code: currency },
      billing_cycle: { interval: "year", frequency: 1 },
      quantity: { minimum: 1, maximum: 1 },
      custom_data: { rivox_plan_key: plan.plan_key, rivox_region: plan.region, rivox_cycle: "yearly" },
    };
    let yearlyPriceId = plan.paddle_yearly_price_id as string | null;
    if (yearlyPriceId) {
      await paddleRequest(apiKey, `/prices/${yearlyPriceId}`, "PATCH", { description: yearlyPayload.description, unit_price: yearlyPayload.unit_price, custom_data: yearlyPayload.custom_data });
    } else {
      const created = await paddleRequest(apiKey, "/prices", "POST", yearlyPayload);
      yearlyPriceId = created.data?.id;
    }

    await admin.from("admin_pricing_plans").update({
      paddle_product_id: productId,
      paddle_monthly_price_id: monthlyPriceId,
      paddle_yearly_price_id: yearlyPriceId,
      paddle_synced: true,
      paddle_sync_status: "synced",
      paddle_last_synced_at: new Date().toISOString(),
      paddle_last_error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", planId);

    return Response.json({ ok: true, productId, monthlyPriceId, yearlyPriceId }, { headers: corsHeaders });
  } catch (error) {
    try {
      if (currentPlanId) {
        const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        await admin.from("admin_pricing_plans").update({
          paddle_synced: false,
          paddle_sync_status: "error",
          paddle_last_error: error instanceof Error ? error.message : "Unexpected Paddle sync error",
          updated_at: new Date().toISOString(),
        }).eq("id", currentPlanId);
      }
    } catch { /* best effort */ }
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Unexpected error" }, { status: 400, headers: corsHeaders });
  }
});
