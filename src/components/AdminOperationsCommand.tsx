import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type Destination = "support" | "billingRecovery" | "system" | "qa";
type QueueItem = {
  id: string; source: Destination; title: string; detail: string;
  severity: "critical" | "high" | "warning"; created_at: string;
};

export default function AdminOperationsCommand({ onNavigate }: { onNavigate: (section: Destination) => void }) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [support, billing, system, qa] = await Promise.all([
      supabase.from("admin_support_tickets").select("id,subject,status,priority,created_at").not("status", "in", '("resolved","closed")').limit(50),
      supabase.from("billing_activation_incidents").select("id,transaction_id,status,severity,error_message,created_at").in("status", ["detecting", "verifying", "manual_review"]).limit(50),
      supabase.from("admin_system_incidents").select("id,title,status,severity,description,created_at").in("status", ["open", "acknowledged", "investigating"]).limit(50),
      supabase.from("admin_qa_runs").select("id,status,score,summary,created_at").eq("status", "failed").limit(20),
    ]);
    const queue: QueueItem[] = [];
    for (const row of support.data || []) queue.push({
      id: `support-${row.id}`, source: "support", title: row.subject,
      detail: `Support ticket · ${row.status}`, severity: row.priority === "urgent" ? "critical" : row.priority === "high" ? "high" : "warning", created_at: row.created_at,
    });
    for (const row of billing.data || []) queue.push({
      id: `billing-${row.id}`, source: "billingRecovery", title: `Delayed payment · ${row.transaction_id}`,
      detail: row.error_message || row.status, severity: row.severity === "critical" ? "critical" : "high", created_at: row.created_at,
    });
    for (const row of system.data || []) queue.push({
      id: `system-${row.id}`, source: "system", title: row.title,
      detail: row.description || row.status, severity: row.severity === "critical" ? "critical" : "warning", created_at: row.created_at,
    });
    for (const row of qa.data || []) queue.push({
      id: `qa-${row.id}`, source: "qa", title: `Production QA failed · ${row.score}%`,
      detail: row.summary || "Release verification requires review", severity: "critical", created_at: row.created_at,
    });
    const rank = { critical: 3, high: 2, warning: 1 };
    queue.sort((a, b) => rank[b.severity] - rank[a.severity] || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setItems(queue); setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const channel = supabase.channel("owner-operations-command")
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_support_tickets" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "billing_activation_incidents" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_system_incidents" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_qa_runs" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const stats = useMemo(() => ({
    critical: items.filter((i) => i.severity === "critical").length,
    support: items.filter((i) => i.source === "support").length,
    billing: items.filter((i) => i.source === "billingRecovery").length,
    platform: items.filter((i) => i.source === "system" || i.source === "qa").length,
  }), [items]);

  const labels: Record<Destination, string> = { support: "Support", billingRecovery: "Payment", system: "System", qa: "Production QA" };
  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-violet-950 to-fuchsia-950 p-6 text-white shadow-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-fuchsia-300">Owner priority desk</p><h1 className="mt-2 text-3xl font-black">Unified Operations Command</h1><p className="mt-2 text-sm text-slate-300">Every customer, revenue, platform and release incident in one prioritized queue.</p></div><button onClick={() => void load()} className="rounded-xl bg-white px-4 py-2.5 text-sm font-black text-slate-950">Refresh command</button></div>
      </div>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[["Critical", stats.critical, "🚨"], ["Support", stats.support, "🎫"], ["Payment", stats.billing, "💳"], ["Platform & QA", stats.platform, "🛡️"]].map(([label, value, icon]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-2xl">{icon}</p><p className="mt-3 text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-1 text-3xl font-black text-slate-950">{value}</p></div>)}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5"><h2 className="text-lg font-black text-slate-950">Priority action queue</h2><p className="text-sm text-slate-500">Critical incidents always appear first.</p></div>
        {loading ? <p className="p-8 text-center text-sm text-slate-500">Loading operations...</p> : items.length === 0 ? <div className="p-10 text-center"><p className="text-3xl">✅</p><p className="mt-2 font-black text-slate-900">Operations clear</p><p className="text-sm text-slate-500">No active customer, payment, platform or QA incidents.</p></div> : <div className="divide-y divide-slate-100">{items.slice(0, 12).map((item) => <button key={item.id} onClick={() => onNavigate(item.source)} className="flex w-full flex-col gap-3 p-5 text-left hover:bg-slate-50 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-black text-slate-950">{item.title}</p><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${item.severity === "critical" ? "bg-red-100 text-red-700" : item.severity === "high" ? "bg-orange-100 text-orange-700" : "bg-amber-100 text-amber-700"}`}>{item.severity}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{labels[item.source]}</span></div><p className="mt-1 text-sm text-slate-500">{item.detail}</p></div><span className="text-sm font-bold text-violet-700">Open →</span></button>)}</div>}
      </div>
    </div>
  );
}
