import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Destination = "finance" | "support" | "system" | "team";

type Kpi = {
  mrrUsd: number;
  activeSubs: number;
  openTickets: number;
  urgentTickets: number;
  systemStatus: "All operational" | "Degraded" | "Major incident" | "Not checked";
  openIncidents: number;
  staffOnline: number;
  staffTotal: number;
};

const EMPTY: Kpi = { mrrUsd: 0, activeSubs: 0, openTickets: 0, urgentTickets: 0, systemStatus: "Not checked", openIncidents: 0, staffOnline: 0, staffTotal: 0 };

export default function AdminUnifiedKPI({ onNavigate }: { onNavigate: (section: Destination) => void }) {
  const [kpi, setKpi] = useState<Kpi>(EMPTY);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [subsRes, ticketsRes, healthRes, incidentsRes, teamRes] = await Promise.all([
      supabase.from("subscriptions").select("status,amount,billing_cycle,currency,provider_environment,cancelled"),
      supabase.from("admin_support_tickets").select("status,priority"),
      supabase.from("admin_system_health_checks").select("service_name,status,checked_at").order("checked_at", { ascending: false }).limit(40),
      supabase.from("admin_system_incidents").select("id,status").neq("status", "resolved"),
      supabase.from("admin_team_members").select("status,availability"),
    ]);

    // Revenue — headline number is USD-only MRR to avoid the classic mistake
    // of adding INR + USD + EUR together (see AdminRevenueIntelligence.tsx,
    // which keeps currencies separate for the same reason). Other currencies
    // are still fully visible on the Revenue & Finance tab this card links to.
    const subs = (subsRes.data ?? []).filter(
      (s: any) => !s.cancelled && s.status === "active" && (s.provider_environment || "production") === "production",
    );
    const activeSubs = subs.length;
    const mrrUsd = subs
      .filter((s: any) => (s.currency || "USD") === "USD")
      .reduce((sum: number, s: any) => sum + Number(s.amount || 0) / (s.billing_cycle === "yearly" ? 12 : 1), 0);

    // Support
    const tickets = ticketsRes.data ?? [];
    const openStatuses = new Set(["open", "in_progress", "waiting_customer", "pending"]);
    const openTickets = tickets.filter((t: any) => openStatuses.has(t.status)).length;
    const urgentTickets = tickets.filter((t: any) => openStatuses.has(t.status) && t.priority === "urgent").length;

    // System health — same "latest per service" logic as AdminSystemMonitor
    const latestByService = new Map<string, string>();
    for (const row of (healthRes.data ?? []) as any[]) {
      if (!latestByService.has(row.service_name)) latestByService.set(row.service_name, row.status);
    }
    const statuses = [...latestByService.values()];
    const systemStatus: Kpi["systemStatus"] =
      statuses.length === 0 ? "Not checked" : statuses.includes("down") ? "Major incident" : statuses.includes("degraded") ? "Degraded" : "All operational";
    const openIncidents = (incidentsRes.data ?? []).length;

    // Team
    const team = (teamRes.data ?? []).filter((m: any) => m.status === "active");
    const staffTotal = team.length;
    const staffOnline = team.filter((m: any) => m.availability === "online" || m.availability === "available").length;

    setKpi({ mrrUsd, activeSubs, openTickets, urgentTickets, systemStatus, openIncidents, staffOnline, staffTotal });
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const systemTone =
    kpi.systemStatus === "All operational" ? "text-emerald-600" : kpi.systemStatus === "Degraded" ? "text-amber-600" : kpi.systemStatus === "Major incident" ? "text-red-600" : "text-slate-400";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-5">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">Business health, at a glance</p>
          <h2 className="text-lg font-black text-slate-950">Unified Owner KPIs</h2>
        </div>
        <button onClick={() => void load()} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50">
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 lg:grid-cols-4 lg:divide-y-0">
        <button onClick={() => onNavigate("finance")} className="p-5 text-left hover:bg-slate-50">
          <p className="text-xs font-bold uppercase text-slate-400">MRR (USD)</p>
          <p className="mt-1 text-2xl font-black text-slate-950">${kpi.mrrUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          <p className="mt-1 text-xs text-slate-500">{kpi.activeSubs} active subscription{kpi.activeSubs === 1 ? "" : "s"} · other currencies in Revenue tab</p>
        </button>
        <button onClick={() => onNavigate("support")} className="p-5 text-left hover:bg-slate-50">
          <p className="text-xs font-bold uppercase text-slate-400">Open tickets</p>
          <p className="mt-1 text-2xl font-black text-slate-950">{kpi.openTickets}</p>
          <p className={`mt-1 text-xs font-semibold ${kpi.urgentTickets > 0 ? "text-red-600" : "text-slate-500"}`}>
            {kpi.urgentTickets > 0 ? `${kpi.urgentTickets} urgent — needs attention` : "None urgent"}
          </p>
        </button>
        <button onClick={() => onNavigate("system")} className="p-5 text-left hover:bg-slate-50">
          <p className="text-xs font-bold uppercase text-slate-400">System status</p>
          <p className={`mt-1 text-2xl font-black ${systemTone}`}>{kpi.systemStatus}</p>
          <p className="mt-1 text-xs text-slate-500">{kpi.openIncidents} open incident{kpi.openIncidents === 1 ? "" : "s"}</p>
        </button>
        <button onClick={() => onNavigate("team")} className="p-5 text-left hover:bg-slate-50">
          <p className="text-xs font-bold uppercase text-slate-400">Team online</p>
          <p className="mt-1 text-2xl font-black text-slate-950">{kpi.staffOnline}/{kpi.staffTotal}</p>
          <p className="mt-1 text-xs text-slate-500">active staff currently available</p>
        </button>
      </div>
    </div>
  );
}
