import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type Team = { id: string; name: string | null; email: string; role: string; status: string };
type Health = {
  id: string; service_name: string; status: "operational" | "degraded" | "down" | "unknown";
  latency_ms: number | null; checked_at: string; details: Record<string, unknown>;
};
type Incident = {
  id: string; service_name: string; title: string; description: string | null;
  severity: "info" | "warning" | "critical"; status: "open" | "acknowledged" | "investigating" | "resolved";
  assigned_to: string | null; first_detected_at: string; last_detected_at: string;
  occurrence_count: number; resolved_at: string | null;
};

const statusStyle = {
  operational: "bg-emerald-100 text-emerald-700",
  degraded: "bg-amber-100 text-amber-700",
  down: "bg-red-100 text-red-700",
  unknown: "bg-slate-100 text-slate-600",
};

export default function AdminSystemMonitor({ team }: { team: Team[] }) {
  const [health, setHealth] = useState<Health[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const [{ data: healthRows, error: healthError }, { data: incidentRows, error: incidentError }] = await Promise.all([
      supabase.from("admin_system_health_checks").select("*").order("checked_at", { ascending: false }).limit(120),
      supabase.from("admin_system_incidents").select("*").order("created_at", { ascending: false }).limit(100),
    ]);
    if (healthError || incidentError) setMessage(healthError?.message || incidentError?.message || "Unable to load monitor.");
    else {
      const latest = new Map<string, Health>();
      for (const row of (healthRows || []) as Health[]) if (!latest.has(row.service_name)) latest.set(row.service_name, row);
      setHealth([...latest.values()]);
      setIncidents((incidentRows || []) as Incident[]);
    }
  }, []);

  useEffect(() => {
    void load();
    const channel = supabase.channel("admin-system-monitor")
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_system_health_checks" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_system_incidents" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const run = async () => {
    setRunning(true); setMessage("");
    const { data, error } = await supabase.functions.invoke("system-health-monitor", { body: { action: "run" } });
    if (error || !data?.ok) setMessage(data?.error || error?.message || "Health check failed.");
    else setMessage(`Health check completed: ${new Date(data.checked_at).toLocaleString()}`);
    await load(); setRunning(false);
  };

  const update = async (id: string, patch: Partial<Incident>) => {
    const { error } = await supabase.from("admin_system_incidents").update(patch).eq("id", id);
    if (error) setMessage(error.message); else await load();
  };

  const active = useMemo(() => incidents.filter((i) => i.status !== "resolved"), [incidents]);
  const operational = health.filter((h) => h.status === "operational").length;
  const overall = health.length === 0 ? "Not checked" : health.some((h) => h.status === "down") ? "Major incident" : health.some((h) => h.status === "degraded") ? "Degraded" : "All operational";

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-6 text-white shadow-xl">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">24/7 operations</p>
            <h1 className="mt-2 text-3xl font-black">System Monitor & Incident Command</h1>
            <p className="mt-2 text-sm text-slate-300">Live platform health, automatic incident detection, assignment and recovery tracking.</p>
          </div>
          <button onClick={() => void run()} disabled={running} className="rounded-xl bg-white px-5 py-3 text-sm font-black text-slate-950 disabled:opacity-60">{running ? "Running checks..." : "Run health check"}</button>
        </div>
      </div>

      {message && <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">{message}</div>}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[["Overall status", overall, "🛡️"], ["Operational", `${operational}/${health.length || 6}`, "✅"], ["Active incidents", String(active.length), "🚨"], ["Critical", String(active.filter((i) => i.severity === "critical").length), "🔥"]].map(([label, value, icon]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-2xl">{icon}</p><p className="mt-3 text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-1 text-xl font-black text-slate-950">{value}</p></div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4"><h2 className="text-lg font-black text-slate-950">Live services</h2><p className="text-sm text-slate-500">Database, authentication, storage, web app, billing and transactional email.</p></div>
        {health.length === 0 ? <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">Run the first health check to establish a production baseline.</p> : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {health.map((item) => <div key={item.service_name} className="rounded-xl border border-slate-100 p-4">
              <div className="flex items-center justify-between gap-3"><p className="font-bold text-slate-900">{item.service_name}</p><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusStyle[item.status]}`}>{item.status}</span></div>
              <div className="mt-3 flex justify-between text-xs text-slate-500"><span>{item.latency_ms ?? 0} ms</span><span>{new Date(item.checked_at).toLocaleString()}</span></div>
            </div>)}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5"><h2 className="text-lg font-black text-slate-950">Incident queue</h2><p className="text-sm text-slate-500">Problems are assigned automatically and resolved when a later check passes.</p></div>
        {active.length === 0 ? <div className="p-10 text-center"><p className="text-3xl">✅</p><p className="mt-2 font-bold text-slate-900">No active system incidents</p></div> : (
          <div className="divide-y divide-slate-100">{active.map((incident) => <div key={incident.id} className="p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div><div className="flex flex-wrap items-center gap-2"><p className="font-black text-slate-950">{incident.title}</p><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${incident.severity === "critical" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{incident.severity}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{incident.status}</span></div>
              <p className="mt-2 text-sm text-slate-600">{incident.description}</p><p className="mt-2 text-xs text-slate-500">Occurrences: {incident.occurrence_count} · Last detected: {new Date(incident.last_detected_at).toLocaleString()}</p></div>
              <div className="grid min-w-[280px] gap-2"><select className="input" value={incident.assigned_to || ""} onChange={(e) => void update(incident.id, { assigned_to: e.target.value || null })}><option value="">Unassigned</option>{team.filter((m) => m.status === "active" && ["full_access", "support", "limited"].includes(m.role)).map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}</select>
              <div className="flex gap-2"><button className="flex-1 rounded-xl border border-amber-200 px-3 py-2 text-sm font-bold text-amber-700" onClick={() => void update(incident.id, { status: "investigating" })}>Investigate</button><button className="flex-1 rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white" onClick={() => void update(incident.id, { status: "resolved", resolved_at: new Date().toISOString() })}>Resolve</button></div></div>
            </div>
          </div>)}</div>
        )}
      </div>
    </div>
  );
}
