import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type PaidPlan = "pro" | "business";
type BillingCycle = "monthly" | "yearly";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getVariantId(plan: PaidPlan, cycle: BillingCycle) {
  const key = `LEMON_VARIANT_${plan.toUpperCase()}_${cycle.toUpperCase()}`;
  const value = Deno.env.get(key);
  if (!value || !/^\d+$/.test(value)) {
    throw new Error(`Missing or invalid Supabase secret: ${key}`);
  }
  return value;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization) return json({ error: "Authentication required" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return json({ error: "Invalid session" }, 401);

    const body = await req.json().catch(() => ({}));
    const plan = body.plan as PaidPlan;
    const cycle = body.cycle as BillingCycle;
    if (!(["pro", "business"] as string[]).includes(plan)) {
      return json({ error: "Invalid paid plan" }, 400);
    }
    if (!(["monthly", "yearly"] as string[]).includes(cycle)) {
      return json({ error: "Invalid billing cycle" }, 400);
    }

    const apiKey = Deno.env.get("LEMON_SQUEEZY_API_KEY");
    const storeId = Deno.env.get("LEMON_SQUEEZY_STORE_ID");
    const appUrl = (Deno.env.get("APP_URL") || req.headers.get("origin") || "").replace(/\/$/, "");
    if (!apiKey) throw new Error("Missing Supabase secret: LEMON_SQUEEZY_API_KEY");
    if (!storeId || !/^\d+$/.test(storeId)) throw new Error("Missing or invalid Supabase secret: LEMON_SQUEEZY_STORE_ID");
    if (!appUrl) throw new Error("Missing Supabase secret: APP_URL");

    const variantId = getVariantId(plan, cycle);
    const response = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
      method: "POST",
      headers: {
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        data: {
          type: "checkouts",
          attributes: {
            product_options: {
              redirect_url: `${appUrl}/billing?checkout=success`,
              receipt_button_text: "Return to InvoiceKit",
              receipt_link_url: `${appUrl}/billing`,
              receipt_thank_you_note: "Thank you for upgrading InvoiceKit.",
            },
            checkout_options: {
              embed: false,
              media: true,
              logo: true,
              desc: true,
              discount: true,
              subscription_preview: true,
            },
            checkout_data: {
              email: user.email,
              custom: {
                user_id: user.id,
                plan,
                billing_cycle: cycle,
              },
            },
            expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          },
          relationships: {
            store: { data: { type: "stores", id: storeId } },
            variant: { data: { type: "variants", id: variantId } },
          },
        },
      }),
    });

    const result = await response.json().catch(() => null);
    if (!response.ok) {
      console.error("Lemon Squeezy checkout error", result);
      return json({ error: result?.errors?.[0]?.detail || "Lemon Squeezy checkout failed" }, 502);
    }

    return json({ url: result?.data?.attributes?.url });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Unexpected checkout error" }, 500);
  }
});
