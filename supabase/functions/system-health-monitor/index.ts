import { createClient } from "@supabase/supabase-js";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

type HealthStatus = "operational" | "degraded" | "down" | "unknown";
type Check = { service_name: string; status: HealthStatus; latency_ms: number; details: Record<string, unknown> };

async function timed(service: string, run: () => Promise<Record<string, unknown>>, degradedMs = 2500): Promise<Check> {
  const started = Date.now();
  try {
    const details = await run();
    const latency = Date.now() - started;
    return { service_name: service, status: latency > degradedMs ? "degraded" : "operational", latency_ms: latency, details };
  } catch (error) {
    return {
      service_name: service,
      status: "down",
      latency_ms: Date.now() - started,
      details: { error: error instanceof Error ? error.message : String(error) },
    };
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authorization = request.headers.get("Authorization") || "";
    const isService = authorization === `Bearer ${serviceKey}`;
    if (!isService) {
      const auth = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
      const { data: { user } } = await auth.auth.getUser();
      if (!user || String(user.email || "").toLowerCase() !== "mz7123272@gmail.com") {
        return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401, headers });
      }
    }

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const appUrl = Deno.env.get("RIVOX_APP_URL") || "https://getrivox.vercel.app";
    const checks: Check[] = [];

    checks.push(await timed("Database", async () => {
      const { error } = await admin.from("profiles").select("id", { head: true, count: "exact" }).limit(1);
      if (error) throw error;
      return { connection: "available" };
    }));
    checks.push(await timed("Authentication", async () => {
      const response = await fetch(`${url}/auth/v1/health`, { headers: { apikey: anonKey } });
      if (!response.ok) throw new Error(`Auth health returned ${response.status}`);
      return { endpoint: "healthy" };
    }));
    checks.push(await timed("Storage", async () => {
      const { error } = await admin.storage.listBuckets();
      if (error) throw error;
      return { connection: "available" };
    }));
    checks.push(await timed("Web Application", async () => {
      const response = await fetch(appUrl, { method: "HEAD", redirect: "follow" });
      if (!response.ok) throw new Error(`Application returned ${response.status}`);
      return { url: appUrl, http_status: response.status };
    }, 4000));

    const paddleReady = Boolean(Deno.env.get("PADDLE_API_KEY") || Deno.env.get("PADDLE_SANDBOX_API_KEY"));
    checks.push({
      service_name: "Paddle Billing",
      status: paddleReady ? "operational" : "down",
      latency_ms: 0,
      details: { credentials_configured: paddleReady },
    });
    const emailReady = Boolean(Deno.env.get("RESEND_API_KEY"));
    checks.push({
      service_name: "Transactional Email",
      status: emailReady ? "operational" : "degraded",
      latency_ms: 0,
      details: { provider: "Resend", credentials_configured: emailReady },
    });

    const checkedAt = new Date().toISOString();
    await admin.from("admin_system_health_checks").insert(checks.map((check) => ({ ...check, checked_at: checkedAt })));

    for (const check of checks) {
      const unhealthy = check.status === "down" || check.status === "degraded";
      const { data: active } = await admin.from("admin_system_incidents")
        .select("*").eq("service_name", check.service_name)
        .in("status", ["open", "acknowledged", "investigating"]).maybeSingle();

      if (unhealthy) {
        let incident = active;
        if (active) {
          const { data } = await admin.from("admin_system_incidents").update({
            last_detected_at: checkedAt,
            occurrence_count: Number(active.occurrence_count || 0) + 1,
            severity: check.status === "down" ? "critical" : "warning",
            description: String(check.details.error || `${check.service_name} is ${check.status}`),
            metadata: check.details,
          }).eq("id", active.id).select("*").single();
          incident = data;
        } else {
          const { data } = await admin.from("admin_system_incidents").insert({
            service_name: check.service_name,
            title: `${check.service_name} ${check.status}`,
            description: String(check.details.error || `${check.service_name} requires attention.`),
            severity: check.status === "down" ? "critical" : "warning",
            metadata: check.details,
          }).select("*").single();
          incident = data;
          if (incident) {
            const notifications: Record<string, unknown>[] = [{
              audience: "admin", type: "system_incident", title: incident.title,
              body: incident.description, metadata: { incident_id: incident.id, severity: incident.severity },
            }];
            if (incident.assigned_to) notifications.push({
              audience: "staff", recipient_team_member_id: incident.assigned_to,
              type: "system_incident", title: incident.title, body: incident.description,
              metadata: { incident_id: incident.id, severity: incident.severity },
            });
            await admin.from("notifications").insert(notifications);
          }
        }
      } else if (active) {
        await admin.from("admin_system_incidents").update({
          status: "resolved", resolved_at: checkedAt, updated_at: checkedAt,
          metadata: { ...active.metadata, recovery: "Automatic health check passed" },
        }).eq("id", active.id);
      }
    }

    return new Response(JSON.stringify({ ok: true, checked_at: checkedAt, checks }), { headers });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }), { status: 500, headers });
  }
});
