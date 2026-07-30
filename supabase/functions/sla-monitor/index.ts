import { createClient } from "@supabase/supabase-js";

// Thin wrapper around the public.run_sla_check() SQL function (see migration
// 20260730190000). Only needed if pg_cron isn't enabled on this Supabase
// project -- point your existing external cron (the one already hitting
// invoice-automation / subscription-automation) at this function too, e.g.
// every 15 minutes, with the same x-automation-secret header.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-automation-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const authorization = req.headers.get("Authorization") || "";
    const cronSecret = req.headers.get("x-automation-secret") || "";
    const expectedCronSecret = Deno.env.get("AUTOMATION_CRON_SECRET") || "";

    if (cronSecret && expectedCronSecret && cronSecret === expectedCronSecret) {
      // Authorized scheduler request.
    } else {
      const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
      const { data: { user }, error } = await client.auth.getUser();
      if (error || !user) throw new Error("Unauthorized");
      const ownerEmail = (Deno.env.get("RIVOX_OWNER_EMAIL") || "mz7123272@gmail.com").toLowerCase();
      if ((user.email || "").toLowerCase() !== ownerEmail) throw new Error("Owner access required");
    }

    const { data, error } = await admin.rpc("run_sla_check");
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, result: data?.[0] || data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "SLA check failed" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
