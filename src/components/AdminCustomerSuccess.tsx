import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type Profile = { id: string; user_id: string; email: string | null; business_name: string | null; country: string | null; currency: string | null; plan: string; created_at: string };
type CustomerRisk = { profile: Profile; score: number; level: "healthy" | "at_risk" | "critical"; reasons: string[]; lastSeen: string | null; invoices: number };

export default function AdminCustomerSuccess() {
  const [risks, setRisks] = useState<CustomerRisk[]>([]);
  const [filter, setFilter] = useState<"all" | "critical" | "at_risk" | "healthy">("all");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const [profiles, subscriptions, sessions, invoices, tickets, events] = await Promise.all([
      supabase.from("profiles").select("id,user_id,email,business_name,country,currency,plan,created_at"),
      supabase.from("subscriptions").select("user_id,status,cancelled,provider_environment").eq("provider_environment", "production"),
      supabase.from("admin_active_sessions").select("user_id,last_seen_at,status").order("last_seen_at", { ascending: false }),
      supabase.from("invoices").select("user_id,id"),
      supabase.from("admin_support_tickets").select("user_id,status,priority").not("status", "in", '("resolved","closed")'),
      supabase.from("billing_events").select("user_id,status,event_name,provider_environment").eq("provider_environment", "production").order("created_at", { ascending: false }).limit(500),
    ]);
    if (profiles.error) { setMessage(profiles.error.message); return; }
    const rows = ((profiles.data || []) as Profile[]).map((profile): CustomerRisk => {
      let score = 0; const reasons: string[] = [];
      const subscription = (subscriptions.data || []).find((s) => s.user_id === profile.user_id);
      const userSessions = (sessions.data || []).filter((s) => s.user_id === profile.user_id && s.status === "active");
      const lastSeen = userSessions[0]?.last_seen_at || null;
      const invoiceCount = (invoices.data || []).filter((i) => i.user_id === profile.user_id).length;
      const openTickets = (tickets.data || []).filter((t) => t.user_id === profile.user_id);
      const paymentFailed = (events.data || []).some((e) => e.user_id === profile.user_id && (e.status === "failed" || String(e.event_name).includes("payment_failed")));
      if (subscription?.cancelled || ["canceled", "cancelled"].includes(subscription?.status || "")) { score += 50; reasons.push("Production subscription cancelled"); }
      if (paymentFailed) { score += 40; reasons.push("Production payment failure recorded"); }
      if (openTickets.some((t) => t.priority === "urgent" || t.priority === "high")) { score += 25; reasons.push("High-priority support issue open"); }
      else if (openTickets.length) { score += 10; reasons.push("Support issue awaiting resolution"); }
      if (invoiceCount === 0 && Date.now() - new Date(profile.created_at).getTime() > 3 * 86400000) { score += 15; reasons.push("No invoice created after onboarding"); }
      if (!lastSeen) { score += 15; reasons.push("No tracked active session"); }
      else if (Date.now() - new Date(lastSeen).getTime() > 14 * 86400000) { score += 20; reasons.push("Inactive for more than 14 days"); }
      if (!profile.business_name || !profile.country || !profile.currency) { score += 10; reasons.push("Business setup incomplete"); }
      score = Math.min(100, score);
      return { profile, score, level: score >= 60 ? "critical" : score >= 30 ? "at_risk" : "healthy", reasons: reasons.length ? reasons : ["No current risk signals"], lastSeen, invoices: invoiceCount };
    }).sort((a, b) => b.score - a.score);
    setRisks(rows); setMessage("");
  }, []);

  useEffect(() => { void load(); }, [load]);
  const visible = useMemo(() => risks.filter((risk) => {
    const q = search.toLowerCase().trim();
    return (filter === "all" || risk.level === filter) && (!q || `${risk.profile.email} ${risk.profile.business_name} ${risk.profile.country}`.toLowerCase().includes(q));
  }), [filter, risks, search]);
  const counts = { critical: risks.filter((r) => r.level === "critical").length, atRisk: risks.filter((r) => r.level === "at_risk").length, healthy: risks.filter((r) => r.level === "healthy").length };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-gradient-to-br from-slate-950 via-rose-950 to-orange-950 p-6 text-white shadow-xl"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-orange-300">Retention operations</p><h1 className="mt-2 text-3xl font-black">Customer Success & Churn Risk</h1><p className="mt-2 text-sm text-slate-300">Explainable risk signals from production billing, support, sessions, onboarding and product usage.</p></div><button onClick={() => void load()} className="rounded-xl bg-white px-4 py-2.5 text-sm font-black text-slate-950">Refresh risks</button></div></div>
      {message && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{message}</div>}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">{[["Critical", counts.critical, "🚨"], ["At risk", counts.atRisk, "⚠️"], ["Healthy", counts.healthy, "💚"], ["Customers assessed", risks.length, "👥"]].map(([label, value, icon]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-2xl">{icon}</p><p className="mt-3 text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-1 text-3xl font-black text-slate-950">{value}</p></div>)}</div>
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-5 lg:flex-row"><input className="input flex-1" placeholder="Search customer, business or country..." value={search} onChange={(e) => setSearch(e.target.value)} /><select className="input lg:w-48" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}><option value="all">All risk levels</option><option value="critical">Critical</option><option value="at_risk">At risk</option><option value="healthy">Healthy</option></select></div>
        {visible.length === 0 ? <p className="p-10 text-center text-sm text-slate-500">No customers match this filter.</p> : <div className="divide-y divide-slate-100">{visible.map((risk) => <div key={risk.profile.user_id} className="p-5"><div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-black text-slate-950">{risk.profile.business_name || risk.profile.email || "Rivox customer"}</p><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${risk.level === "critical" ? "bg-red-100 text-red-700" : risk.level === "at_risk" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{risk.level.replace("_", " ")}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{risk.profile.plan}</span></div><p className="mt-1 text-sm text-slate-500">{risk.profile.email} · {risk.profile.country || "Country missing"}</p><div className="mt-3 flex flex-wrap gap-2">{risk.reasons.map((reason) => <span key={reason} className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600">{reason}</span>)}</div><p className="mt-3 text-xs text-slate-500">Invoices: {risk.invoices} · Last active: {risk.lastSeen ? new Date(risk.lastSeen).toLocaleString() : "Not tracked"}</p></div><div className="min-w-32 text-right"><p className="text-xs font-bold uppercase text-slate-500">Risk score</p><p className={`text-4xl font-black ${risk.level === "critical" ? "text-red-600" : risk.level === "at_risk" ? "text-amber-600" : "text-emerald-600"}`}>{risk.score}</p><p className="text-xs text-slate-400">Rule-based / 100</p></div></div></div>)}</div>}
      </div>
    </div>
  );
}
