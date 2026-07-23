import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Profile } from "../lib/types";

type TeamMember = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  status: string;
};

type Incident = {
  id: string;
  user_id: string;
  transaction_id: string;
  provider_environment: "sandbox" | "production";
  expected_plan: string | null;
  status: "detecting" | "verifying" | "activated" | "manual_review" | "resolved";
  severity: "warning" | "critical";
  paddle_status: string | null;
  attempts: number;
  error_message: string | null;
  assigned_to: string | null;
  first_detected_at: string;
  last_checked_at: string;
  notified_at: string | null;
  activated_at: string | null;
  resolved_at: string | null;
};

function elapsed(iso: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}

export default function AdminBillingRecovery({ profiles, team }: { profiles: Profile[]; team: TeamMember[] }) {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("active");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("billing_activation_incidents")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) setMessage(error.message);
    else setIncidents((data || []) as Incident[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const channel = supabase.channel("admin-billing-recovery")
      .on("postgres_changes", { event: "*", schema: "public", table: "billing_activation_incidents" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const activeStatuses = ["detecting", "verifying", "manual_review"];
  const visible = useMemo(() => incidents.filter((incident) => {
    const profile = profiles.find((p) => p.user_id === incident.user_id || p.id === incident.user_id);
    const text = `${incident.transaction_id} ${profile?.email || ""} ${profile?.business_name || ""}`.toLowerCase();
    const matchesSearch = !search.trim() || text.includes(search.trim().toLowerCase());
    const matchesFilter = filter === "all"
      || (filter === "active" && activeStatuses.includes(incident.status))
      || incident.status === filter;
    return matchesSearch && matchesFilter;
  }), [filter, incidents, profiles, search]);

  const updateIncident = async (id: string, patch: Partial<Incident>) => {
    setMessage("");
    const { error } = await supabase.from("billing_activation_incidents").update(patch).eq("id", id);
    if (error) setMessage(error.message);
    else {
      setMessage("Recovery incident updated.");
      await load();
    }
  };

  const active = incidents.filter((i) => activeStatuses.includes(i.status)).length;
  const critical = incidents.filter((i) => i.status === "manual_review").length;
  const recovered = incidents.filter((i) => i.status === "activated" || i.status === "resolved").length;
  const autoRecovered = incidents.filter((i) => i.status === "activated").length;

  return (
    <section className="space-y-6">
      <div className="overflow-hidden rounded-3xl bg-slate-950 p-6 text-white shadow-xl">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-violet-300">Revenue protection</p>
            <h1 className="mt-2 text-3xl font-black">Payment Activation Recovery</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">
              Delayed subscriptions are verified directly with Paddle. Rivox never activates a paid plan from an unverified browser signal.
            </p>
          </div>
          <button onClick={() => void load()} className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-950">Refresh queue</button>
        </div>
      </div>

      {message && <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800">{message}</div>}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[
          ["Active queue", active, "⏱️"],
          ["Manual review", critical, "🚨"],
          ["Recovered", recovered, "✅"],
          ["Auto-activated", autoRecovered, "⚡"],
        ].map(([label, value, icon]) => (
          <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-2xl">{icon}</div>
            <p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 text-3xl font-black text-slate-950">{value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-5 lg:flex-row">
          <input className="input flex-1" placeholder="Search transaction, customer or business..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="input lg:w-52" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="active">Active queue</option>
            <option value="manual_review">Manual review</option>
            <option value="activated">Activated</option>
            <option value="resolved">Resolved</option>
            <option value="all">All incidents</option>
          </select>
        </div>

        {loading ? <p className="p-8 text-center text-sm text-slate-500">Loading recovery queue...</p> : visible.length === 0 ? (
          <div className="p-10 text-center"><p className="text-3xl">✅</p><p className="mt-2 font-bold text-slate-900">No matching activation incidents</p><p className="text-sm text-slate-500">Verified payments are activating normally.</p></div>
        ) : (
          <div className="divide-y divide-slate-100">
            {visible.map((incident) => {
              const profile = profiles.find((p) => p.user_id === incident.user_id || p.id === incident.user_id);
              return (
                <article key={incident.id} className="p-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-black text-slate-950">{profile?.business_name || profile?.email || "Rivox customer"}</p>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${incident.severity === "critical" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{incident.severity}</span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{incident.status.replace("_", " ")}</span>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">{profile?.email || incident.user_id}</p>
                      <p className="mt-3 break-all font-mono text-sm font-semibold text-slate-800">{incident.transaction_id}</p>
                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                        <span>{incident.provider_environment}</span><span>Plan: {incident.expected_plan || "unknown"}</span>
                        <span>Paddle: {incident.paddle_status || "checking"}</span><span>Checks: {incident.attempts}</span>
                        <span>Waiting: {elapsed(incident.first_detected_at)}</span>
                      </div>
                      {incident.error_message && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{incident.error_message}</p>}
                    </div>
                    <div className="grid min-w-[280px] gap-2">
                      <select className="input" value={incident.assigned_to || ""} onChange={(e) => void updateIncident(incident.id, { assigned_to: e.target.value || null })}>
                        <option value="">Unassigned</option>
                        {team.filter((m) => m.status === "active" && ["support", "full_access", "finance"].includes(m.role)).map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
                      </select>
                      <div className="flex gap-2">
                        <button onClick={() => void updateIncident(incident.id, { status: "manual_review", severity: "critical" })} className="flex-1 rounded-xl border border-red-200 px-3 py-2 text-sm font-bold text-red-700">Escalate</button>
                        <button onClick={() => void updateIncident(incident.id, { status: "resolved", resolved_at: new Date().toISOString() })} className="flex-1 rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white">Resolve</button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
