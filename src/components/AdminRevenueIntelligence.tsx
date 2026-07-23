import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type Subscription = {
  id: string; plan: string; billing_cycle: string | null; status: string;
  currency: string | null; amount: number | null; cancelled: boolean;
  created_at: string; updated_at: string;
};
type BillingEvent = { id: string; event_name: string; status: string | null; amount: number; currency: string | null; created_at: string };

function money(value: number, currency: string) {
  try { return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 2 }).format(value); }
  catch { return `${currency} ${value.toFixed(2)}`; }
}

export default function AdminRevenueIntelligence() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [events, setEvents] = useState<BillingEvent[]>([]);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const [subs, billing] = await Promise.all([
      supabase.from("subscriptions").select("id,plan,billing_cycle,status,currency,amount,cancelled,created_at,updated_at").order("updated_at", { ascending: false }),
      supabase.from("billing_events").select("id,event_name,status,amount,currency,created_at").order("created_at", { ascending: false }).limit(500),
    ]);
    if (subs.error || billing.error) setMessage(subs.error?.message || billing.error?.message || "Unable to load revenue intelligence.");
    else { setSubscriptions((subs.data || []) as Subscription[]); setEvents((billing.data || []) as BillingEvent[]); }
  }, []);

  useEffect(() => {
    void load();
    const channel = supabase.channel("admin-revenue-intelligence")
      .on("postgres_changes", { event: "*", schema: "public", table: "subscriptions" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "billing_events" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const analytics = useMemo(() => {
    const active = subscriptions.filter((s) => ["active", "trialing"].includes(s.status) && !s.cancelled);
    const currency = new Map<string, { mrr: number; collected: number; active: number }>();
    for (const sub of active) {
      const code = (sub.currency || "USD").toUpperCase();
      const bucket = currency.get(code) || { mrr: 0, collected: 0, active: 0 };
      bucket.mrr += Number(sub.amount || 0) / (sub.billing_cycle === "yearly" ? 12 : 1);
      bucket.active += 1; currency.set(code, bucket);
    }
    for (const event of events.filter((e) => e.status === "completed" || e.event_name === "transaction.completed")) {
      const code = (event.currency || "USD").toUpperCase();
      const bucket = currency.get(code) || { mrr: 0, collected: 0, active: 0 };
      bucket.collected += Number(event.amount || 0); currency.set(code, bucket);
    }
    const plans = ["free", "pro", "business"].map((plan) => ({ plan, count: subscriptions.filter((s) => s.plan === plan && ["active", "trialing"].includes(s.status)).length }));
    const failures = events.filter((e) => e.event_name.includes("payment_failed") || e.status === "failed").length;
    const churned = subscriptions.filter((s) => s.cancelled || ["canceled", "cancelled"].includes(s.status)).length;
    const new30 = subscriptions.filter((s) => Date.now() - new Date(s.created_at).getTime() < 30 * 86400000).length;
    return { active, currency: [...currency.entries()], plans, failures, churned, new30 };
  }, [events, subscriptions]);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-blue-950 p-6 text-white shadow-xl"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-blue-300">Global SaaS economics</p><h1 className="mt-2 text-3xl font-black">Revenue & Subscription Intelligence</h1><p className="mt-2 text-sm text-slate-300">MRR, ARR, collections, churn and plan performance without mixing international currencies.</p></div><button onClick={() => void load()} className="rounded-xl bg-white px-4 py-2.5 text-sm font-black text-slate-950">Refresh revenue</button></div></div>
      {message && <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">{message}</div>}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[["Active subscriptions", analytics.active.length, "💳"], ["New subscriptions 30d", analytics.new30, "📈"], ["Payment failures", analytics.failures, "⚠️"], ["Churned/cancelled", analytics.churned, "📉"]].map(([label, value, icon]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-2xl">{icon}</p><p className="mt-3 text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-1 text-3xl font-black text-slate-950">{value}</p></div>)}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-5"><h2 className="text-lg font-black text-slate-950">Currency-separated revenue</h2><p className="text-sm text-slate-500">No misleading USD + INR + EUR combined total.</p></div>{analytics.currency.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">Verified subscription revenue will appear here.</p> : <div className="overflow-x-auto"><table className="w-full"><thead><tr className="bg-slate-50 text-left text-xs uppercase text-slate-500"><th className="px-5 py-3">Currency</th><th className="px-5 py-3">Active</th><th className="px-5 py-3">MRR</th><th className="px-5 py-3">ARR run-rate</th><th className="px-5 py-3">Collected events</th></tr></thead><tbody className="divide-y divide-slate-100">{analytics.currency.map(([code, data]) => <tr key={code}><td className="px-5 py-4 font-black text-slate-900">{code}</td><td className="px-5 py-4 text-slate-600">{data.active}</td><td className="px-5 py-4 font-bold text-slate-900">{money(data.mrr, code)}</td><td className="px-5 py-4 font-bold text-slate-900">{money(data.mrr * 12, code)}</td><td className="px-5 py-4 text-slate-700">{money(data.collected, code)}</td></tr>)}</tbody></table></div>}</div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-black text-slate-950">Active plan mix</h2><div className="mt-5 space-y-4">{analytics.plans.map((plan) => { const total = Math.max(1, analytics.plans.reduce((sum, item) => sum + item.count, 0)); const width = Math.round((plan.count / total) * 100); return <div key={plan.plan}><div className="flex justify-between text-sm"><span className="font-bold capitalize text-slate-700">{plan.plan}</span><span className="font-black text-slate-950">{plan.count}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${width}%` }} /></div></div>; })}</div></div>
      </div>
    </div>
  );
}
