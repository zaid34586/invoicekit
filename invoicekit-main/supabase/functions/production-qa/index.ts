import { createClient } from "@supabase/supabase-js";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};
type Result = { area: string; check_name: string; status: "pass" | "warning" | "fail"; latency_ms: number; detail: string; metadata?: Record<string, unknown> };

async function check(area: string, name: string, run: () => Promise<string>, warningMs = 3000): Promise<Result> {
  const started = Date.now();
  try {
    const detail = await run();
    const latency = Date.now() - started;
    return { area, check_name: name, status: latency > warningMs ? "warning" : "pass", latency_ms: latency, detail };
  } catch (error) {
    return { area, check_name: name, status: "fail", latency_ms: Date.now() - started, detail: error instanceof Error ? error.message : String(error) };
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authorization = request.headers.get("Authorization") || "";
    const auth = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: { user } } = await auth.auth.getUser();
    if (!user || String(user.email || "").toLowerCase() !== "mz7123272@gmail.com") {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401, headers });
    }
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const body = await request.json().catch(() => ({}));
    const app = Deno.env.get("RIVOX_APP_URL") || "https://getrivox.vercel.app";
    const started = Date.now();
    const { data: runRow, error: runError } = await admin.from("admin_qa_runs").insert({
      status: "running", trigger_source: body.trigger_source || "manual",
      release_version: body.release_version || null, created_by: user.id,
    }).select("id").single();
    if (runError) throw runError;

    const results: Result[] = [];
    for (const [name, path] of [["Landing page", "/"], ["Login route", "/login"], ["Signup route", "/signup"], ["Password recovery route", "/forgot-password"]]) {
      results.push(await check("Frontend", name, async () => {
        const response = await fetch(`${app}${path}`, { method: "GET", redirect: "follow" });
        if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
        const html = await response.text();
        if (!html.toLowerCase().includes("rivox") && !html.includes('id="root"')) throw new Error(`${path} returned unexpected HTML`);
        return `${path} available · HTTP ${response.status}`;
      }, 4000));
    }
    results.push(await check("Authentication", "Supabase Auth health", async () => {
      const response = await fetch(`${url}/auth/v1/health`, { headers: { apikey: anonKey } });
      if (!response.ok) throw new Error(`Auth returned HTTP ${response.status}`);
      return "Authentication service available";
    }));
    for (const table of ["profiles", "clients", "invoices", "subscriptions", "admin_support_tickets"]) {
      results.push(await check("Database", `${table} access`, async () => {
        const { error } = await admin.from(table).select("id", { head: true }).limit(1);
        if (error) throw error;
        return `${table} query passed`;
      }));
    }
    results.push(await check("Storage", "Storage API access", async () => {
      const { error } = await admin.storage.listBuckets();
      if (error) throw error;
      return "Storage API available";
    }));
    results.push(await check("Billing", "Paddle subscription function", async () => {
      const response = await fetch(`${url}/functions/v1/paddle-subscriptions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}`, apikey: anonKey }, body: '{"action":"status"}' });
      if (![200, 401].includes(response.status)) throw new Error(`Billing function returned HTTP ${response.status}`);
      return `Billing function reachable · protected HTTP ${response.status}`;
    }));

    const passed = results.filter((r) => r.status === "pass").length;
    const failed = results.filter((r) => r.status === "fail").length;
    const score = Math.round((passed / results.length) * 100);
    const status = failed > 0 ? "failed" : results.some((r) => r.status === "warning") ? "warning" : "passed";
    await admin.from("admin_qa_check_results").insert(results.map((result) => ({ ...result, run_id: runRow.id, metadata: result.metadata || {} })));
    await admin.from("admin_qa_runs").update({
      status, score, passed_checks: passed, total_checks: results.length,
      duration_ms: Date.now() - started, summary: failed ? `${failed} production checks failed.` : "Production release checks completed.",
      completed_at: new Date().toISOString(),
    }).eq("id", runRow.id);
    if (failed) await admin.from("notifications").insert({
      audience: "admin", type: "production_qa_failed", title: "Production QA failed",
      body: `${failed} of ${results.length} checks failed. Release score: ${score}%`,
      metadata: { run_id: runRow.id, severity: "critical" },
    });
    return new Response(JSON.stringify({ ok: true, run_id: runRow.id, status, score, passed, total: results.length, results }), { headers });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }), { status: 500, headers });
  }
});
