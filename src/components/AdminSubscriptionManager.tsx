import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { syncOfferWithPaddle } from "../lib/paddleOffers";
import { syncPlanWithPaddle } from "../lib/paddlePrices";

type PlanRow = {
  id: string;
  plan_key: "free" | "pro" | "business";
  region: "global" | "india";
  name: string;
  currency: string;
  monthly_price: number;
  yearly_price: number;
  invoice_limit: number | null;
  client_limit: number | null;
  team_limit: number | null;
  active: boolean;
  popular: boolean;
  paddle_synced: boolean;
  paddle_sync_status: "not_synced" | "syncing" | "synced" | "error";
  paddle_last_error: string | null;
};

type PromoRow = {
  id: string;
  code: string;
  label: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  applies_to: string[];
  billing_scope: "monthly" | "yearly" | "all";
  usage_limit: number | null;
  expires_at: string | null;
  active: boolean;
};

export default function AdminSubscriptionManager() {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [promos, setPromos] = useState<PromoRow[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [promoForm, setPromoForm] = useState({ code: "", label: "", discount_value: "20", discount_type: "percentage", billing_scope: "all", applies_to: ["pro", "business"] as string[], usage_limit: "", expires_at: "" });
  const [syncingPlanId, setSyncingPlanId] = useState<string | null>(null);

  async function load() {
    const [planResult, promoResult] = await Promise.all([
      supabase.from("admin_pricing_plans").select("*").order("sort_order"),
      supabase.from("admin_promo_codes").select("*").order("created_at", { ascending: false }),
    ]);
    if (planResult.error || promoResult.error) {
      setNotice(`Run the subscription migration first: ${planResult.error?.message || promoResult.error?.message}`);
      return;
    }
    setPlans((planResult.data as PlanRow[]) ?? []);
    setPromos((promoResult.data as PromoRow[]) ?? []);
  }

  useEffect(() => { load(); }, []);

  async function savePlan(plan: PlanRow) {
    const { error } = await supabase.from("admin_pricing_plans").update({
      name: plan.name,
      monthly_price: Number(plan.monthly_price),
      yearly_price: Number(plan.yearly_price),
      invoice_limit: plan.invoice_limit,
      client_limit: plan.client_limit,
      team_limit: plan.team_limit,
      active: plan.active,
      popular: plan.popular,
      updated_at: new Date().toISOString(),
    }).eq("id", plan.id);
    setNotice(error ? error.message : `${plan.name} plan saved. Click "Sync Paddle" so checkout charges this price too.`);
    if (!error) await load();
  }

  // Pushes the plan's current DB price to Paddle as a live Price object.
  // Without this, checkout keeps charging whatever price was set in Paddle
  // the very first time -- "Save plan" alone only ever updated our own DB.
  async function syncPlan(plan: PlanRow) {
    setSyncingPlanId(plan.id);
    setNotice("Syncing plan price with Paddle\u2026");
    try {
      await syncPlanWithPaddle(plan.id);
      setNotice(`${plan.name} (${plan.region}) price is now live on Paddle checkout.`);
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Paddle price sync failed.");
      await load();
    } finally {
      setSyncingPlanId(null);
    }
  }

  async function createPromo() {
    const code = promoForm.code.trim().toUpperCase();
    if (!code || !promoForm.label.trim()) return;
    const { data, error } = await supabase.from("admin_promo_codes").insert({
      code,
      label: promoForm.label.trim(),
      discount_type: promoForm.discount_type,
      discount_value: Number(promoForm.discount_value),
      applies_to: promoForm.applies_to,
      billing_scope: promoForm.billing_scope,
      usage_limit: promoForm.usage_limit ? Number(promoForm.usage_limit) : null,
      expires_at: promoForm.expires_at ? new Date(`${promoForm.expires_at}T23:59:59`).toISOString() : null,
    }).select("id").single();
    if (error) { setNotice(error.message); return; }
    setPromoForm({ code: "", label: "", discount_value: "20", discount_type: "percentage", billing_scope: "all", applies_to: ["pro", "business"], usage_limit: "", expires_at: "" });
    await load();
    // This simple form used to only insert into our DB, which showed the
    // discount on plan cards but never reached Paddle checkout (same class
    // of bug as plan prices above). Sync it immediately so it works exactly
    // like offers created from Growth Center.
    if (data?.id) {
      setNotice(`Promo ${code} created. Syncing with Paddle\u2026`);
      try {
        await syncOfferWithPaddle(data.id);
        setNotice(`Promo ${code} created and is live on Paddle checkout.`);
      } catch (error) {
        setNotice(`Promo ${code} created, but Paddle sync failed: ${error instanceof Error ? error.message : "unknown error"}. It will only show as a display badge until synced.`);
      }
      await load();
    } else {
      setNotice(`Promo ${code} created.`);
    }
  }

  async function togglePromo(promo: PromoRow) {
    const { error } = await supabase.from("admin_promo_codes").update({ active: !promo.active }).eq("id", promo.id);
    setNotice(error ? error.message : `${promo.code} ${promo.active ? "disabled" : "enabled"}.`);
    if (!error) await load();
  }

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950 p-7 text-white shadow-xl">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-violet-300">Revenue controls</p>
        <h1 className="mt-3 text-3xl font-black">Subscriptions, pricing & offers</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Edit plan capacity, monthly/yearly pricing, launch offers and promo rules from one owner-only workspace.</p>
      </div>
      {notice && <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">{notice}</div>}

      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5 sm:p-6">
          <h2 className="text-xl font-black text-slate-950">Plan editor</h2>
          <p className="mt-1 text-sm text-slate-500">Null limits mean unlimited. Prices are stored in the selected currency's major unit.</p>
        </div>
        <div className="grid gap-5 p-5 sm:p-6 xl:grid-cols-3">
          {plans.map((plan, index) => (
            <div key={plan.id} className={`rounded-3xl border p-5 ${plan.popular ? "border-violet-300 bg-violet-50/50 ring-4 ring-violet-100" : "border-slate-200"}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-black uppercase tracking-wide text-violet-600">{plan.plan_key} · {plan.region === "india" ? "🇮🇳 India (INR)" : "🌍 Global (USD)"}</p>
                    {plan.plan_key !== "free" && (
                      plan.paddle_synced ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Paddle live</span>
                      : plan.paddle_sync_status === "error" ? <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">Sync error</span>
                      : <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">Not synced to checkout</span>
                    )}
                  </div>
                  <input value={plan.name} onChange={(e) => setPlans((rows) => rows.map((row, i) => i === index ? { ...row, name: e.target.value } : row))} className="mt-1 w-full bg-transparent text-xl font-black text-slate-950 outline-none" />
                  {plan.paddle_sync_status === "error" && plan.paddle_last_error && <p className="mt-1 text-xs font-medium text-red-600">{plan.paddle_last_error}</p>}
                </div>
                <label className="text-xs font-bold text-slate-500"><input type="checkbox" checked={plan.active} onChange={(e) => setPlans((rows) => rows.map((row, i) => i === index ? { ...row, active: e.target.checked } : row))} className="mr-2" />Active</label>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <label className="text-xs font-bold text-slate-500">Monthly<input type="number" value={plan.monthly_price} onChange={(e) => setPlans((rows) => rows.map((row, i) => i === index ? { ...row, monthly_price: Number(e.target.value) } : row))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
                <label className="text-xs font-bold text-slate-500">Yearly total<input type="number" value={plan.yearly_price} onChange={(e) => setPlans((rows) => rows.map((row, i) => i === index ? { ...row, yearly_price: Number(e.target.value) } : row))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
                <label className="text-xs font-bold text-slate-500">Invoices<input type="number" value={plan.invoice_limit ?? ""} placeholder="Unlimited" onChange={(e) => setPlans((rows) => rows.map((row, i) => i === index ? { ...row, invoice_limit: e.target.value === "" ? null : Number(e.target.value) } : row))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
                <label className="text-xs font-bold text-slate-500">Clients<input type="number" value={plan.client_limit ?? ""} placeholder="Unlimited" onChange={(e) => setPlans((rows) => rows.map((row, i) => i === index ? { ...row, client_limit: e.target.value === "" ? null : Number(e.target.value) } : row))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
                <label className="text-xs font-bold text-slate-500">Team seats<input type="number" value={plan.team_limit ?? ""} placeholder="Unlimited" onChange={(e) => setPlans((rows) => rows.map((row, i) => i === index ? { ...row, team_limit: e.target.value === "" ? null : Number(e.target.value) } : row))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
                <label className="flex items-end pb-2 text-xs font-bold text-slate-500"><input type="checkbox" checked={plan.popular} onChange={(e) => setPlans((rows) => rows.map((row, i) => i === index ? { ...row, popular: e.target.checked } : row))} className="mr-2" />Most popular</label>
              </div>
              <div className="mt-5 flex gap-2">
                <button onClick={() => savePlan(plan)} className="flex-1 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-violet-600">Save plan</button>
                {plan.plan_key !== "free" && (
                  <button onClick={() => syncPlan(plan)} disabled={syncingPlanId === plan.id} className="flex-1 rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-black text-cyan-700 disabled:opacity-50">
                    {syncingPlanId === plan.id ? "Syncing…" : plan.paddle_synced ? "Re-sync Paddle" : "Sync Paddle"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[390px_1fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-xl font-black text-slate-950">Create promo code</h2>
          <div className="mt-5 space-y-3">
            <input value={promoForm.code} onChange={(e) => setPromoForm({ ...promoForm, code: e.target.value })} placeholder="Code e.g. RIVOX30" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm uppercase" />
            <input value={promoForm.label} onChange={(e) => setPromoForm({ ...promoForm, label: e.target.value })} placeholder="Offer title" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
            <div className="grid grid-cols-2 gap-3">
              <select value={promoForm.discount_type} onChange={(e) => setPromoForm({ ...promoForm, discount_type: e.target.value })} className="rounded-2xl border border-slate-200 px-3 py-3 text-sm"><option value="percentage">Percentage</option><option value="fixed">Fixed amount</option></select>
              <input type="number" value={promoForm.discount_value} onChange={(e) => setPromoForm({ ...promoForm, discount_value: e.target.value })} className="rounded-2xl border border-slate-200 px-3 py-3 text-sm" />
              <select value={promoForm.billing_scope} onChange={(e) => setPromoForm({ ...promoForm, billing_scope: e.target.value })} className="rounded-2xl border border-slate-200 px-3 py-3 text-sm"><option value="all">Monthly + yearly</option><option value="monthly">Monthly only</option><option value="yearly">Yearly only</option></select>
              <input type="number" value={promoForm.usage_limit} onChange={(e) => setPromoForm({ ...promoForm, usage_limit: e.target.value })} placeholder="Usage limit" className="rounded-2xl border border-slate-200 px-3 py-3 text-sm" />
            </div>
            <input type="date" value={promoForm.expires_at} onChange={(e) => setPromoForm({ ...promoForm, expires_at: e.target.value })} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
            <button onClick={createPromo} className="w-full rounded-2xl bg-violet-600 px-4 py-3 text-sm font-black text-white hover:bg-violet-500">Create offer</button>
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5 sm:p-6"><h2 className="text-xl font-black text-slate-950">Promo & offer library</h2><p className="mt-1 text-sm text-slate-500">Enable, disable and review launch offers.</p></div>
          <div className="divide-y divide-slate-100">
            {promos.length === 0 ? <div className="p-10 text-center text-slate-500">No promo codes yet.</div> : promos.map((promo) => (
              <div key={promo.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div><div className="flex items-center gap-2"><span className="rounded-lg bg-slate-950 px-2.5 py-1 font-mono text-sm font-black text-white">{promo.code}</span><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${promo.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{promo.active ? "Active" : "Disabled"}</span></div><p className="mt-2 font-bold text-slate-950">{promo.label}</p><p className="mt-1 text-xs text-slate-500">{promo.discount_value}{promo.discount_type === "percentage" ? "%" : " fixed"} off · {promo.billing_scope} · {promo.applies_to.join(", ")}</p></div>
                <button onClick={() => togglePromo(promo)} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">{promo.active ? "Disable" : "Enable"}</button>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
