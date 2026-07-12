import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { getOfferStatus, type MarketingOffer } from "../lib/offers";

type PlanRow = {
  id: string;
  plan_key: "free" | "pro" | "business";
  name: string;
  currency: string;
  monthly_price: number;
  yearly_price: number;
  invoice_limit: number | null;
  client_limit: number | null;
  team_limit: number | null;
  active: boolean;
  popular: boolean;
};

type OfferForm = {
  id?: string;
  code: string;
  label: string;
  description: string;
  badge_text: string;
  discount_value: string;
  discount_type: "percentage" | "fixed";
  billing_scope: "monthly" | "yearly" | "all";
  applies_to: string[];
  usage_limit: string;
  starts_at: string;
  expires_at: string;
  featured: boolean;
  priority: string;
  paddle_discount_id: string;
  paddle_synced: boolean;
};

const EMPTY_OFFER: OfferForm = {
  code: "",
  label: "",
  description: "",
  badge_text: "",
  discount_value: "20",
  discount_type: "percentage",
  billing_scope: "all",
  applies_to: ["pro", "business"],
  usage_limit: "",
  starts_at: "",
  expires_at: "",
  featured: false,
  priority: "0",
  paddle_discount_id: "",
  paddle_synced: false,
};

function dateInput(value: string | null | undefined) {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

function statusStyle(status: ReturnType<typeof getOfferStatus>) {
  if (status === "active") return "bg-emerald-50 text-emerald-700";
  if (status === "scheduled") return "bg-blue-50 text-blue-700";
  if (status === "expired") return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-500";
}

export default function AdminSubscriptionManager() {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [offers, setOffers] = useState<MarketingOffer[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [offerForm, setOfferForm] = useState<OfferForm>(EMPTY_OFFER);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "scheduled" | "expired" | "disabled">("all");
  const [saving, setSaving] = useState(false);

  async function load() {
    const [planResult, offerResult] = await Promise.all([
      supabase.from("admin_pricing_plans").select("*").order("sort_order"),
      supabase.from("admin_promo_codes").select("*").order("featured", { ascending: false }).order("priority", { ascending: false }).order("created_at", { ascending: false }),
    ]);
    if (planResult.error || offerResult.error) {
      setNotice(`Run the latest Supabase migrations first: ${planResult.error?.message || offerResult.error?.message}`);
      return;
    }
    setPlans((planResult.data as PlanRow[]) ?? []);
    setOffers((offerResult.data as MarketingOffer[]) ?? []);
  }

  useEffect(() => { void load(); }, []);

  const filteredOffers = useMemo(() => offers.filter((offer) => {
    const matchesSearch = !search.trim() || `${offer.code} ${offer.label} ${offer.description ?? ""}`.toLowerCase().includes(search.trim().toLowerCase());
    const status = getOfferStatus(offer);
    return matchesSearch && (filter === "all" || status === filter);
  }), [offers, search, filter]);

  const counts = useMemo(() => offers.reduce((acc, offer) => {
    const status = getOfferStatus(offer);
    acc[status] += 1;
    return acc;
  }, { active: 0, scheduled: 0, expired: 0, disabled: 0 }), [offers]);

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
    setNotice(error ? error.message : `${plan.name} plan saved.`);
    if (!error) await load();
  }

  function togglePlan(plan: string) {
    setOfferForm((current) => ({
      ...current,
      applies_to: current.applies_to.includes(plan)
        ? current.applies_to.filter((item) => item !== plan)
        : [...current.applies_to, plan],
    }));
  }

  function editOffer(offer: MarketingOffer) {
    setOfferForm({
      id: offer.id,
      code: offer.code,
      label: offer.label,
      description: offer.description ?? "",
      badge_text: offer.badge_text ?? "",
      discount_value: String(offer.discount_value),
      discount_type: offer.discount_type,
      billing_scope: offer.billing_scope,
      applies_to: offer.applies_to,
      usage_limit: offer.usage_limit ? String(offer.usage_limit) : "",
      starts_at: dateInput(offer.starts_at),
      expires_at: dateInput(offer.expires_at),
      featured: offer.featured,
      priority: String(offer.priority),
      paddle_discount_id: offer.paddle_discount_id ?? "",
      paddle_synced: offer.paddle_synced,
    });
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }

  async function saveOffer() {
    const code = offerForm.code.trim().toUpperCase();
    if (!code || !offerForm.label.trim() || offerForm.applies_to.length === 0) {
      setNotice("Offer code, title and at least one plan are required.");
      return;
    }
    setSaving(true);
    const payload = {
      code,
      label: offerForm.label.trim(),
      description: offerForm.description.trim() || null,
      badge_text: offerForm.badge_text.trim() || null,
      discount_type: offerForm.discount_type,
      discount_value: Number(offerForm.discount_value),
      applies_to: offerForm.applies_to,
      billing_scope: offerForm.billing_scope,
      usage_limit: offerForm.usage_limit ? Number(offerForm.usage_limit) : null,
      starts_at: offerForm.starts_at ? new Date(`${offerForm.starts_at}T00:00:00`).toISOString() : null,
      expires_at: offerForm.expires_at ? new Date(`${offerForm.expires_at}T23:59:59`).toISOString() : null,
      featured: offerForm.featured,
      priority: Number(offerForm.priority || 0),
      paddle_discount_id: offerForm.paddle_discount_id.trim() || null,
      paddle_synced: offerForm.paddle_synced,
      updated_at: new Date().toISOString(),
    };
    const result = offerForm.id
      ? await supabase.from("admin_promo_codes").update(payload).eq("id", offerForm.id)
      : await supabase.from("admin_promo_codes").insert(payload);
    setSaving(false);
    setNotice(result.error ? result.error.message : `Offer ${code} ${offerForm.id ? "updated" : "created"}.`);
    if (!result.error) {
      setOfferForm(EMPTY_OFFER);
      await load();
    }
  }

  async function toggleOffer(offer: MarketingOffer) {
    const { error } = await supabase.from("admin_promo_codes").update({ active: !offer.active, updated_at: new Date().toISOString() }).eq("id", offer.id);
    setNotice(error ? error.message : `${offer.code} ${offer.active ? "disabled" : "enabled"}.`);
    if (!error) await load();
  }

  async function duplicateOffer(offer: MarketingOffer) {
    const { id: _id, created_at: _created, updated_at: _updated, ...copy } = offer;
    const { error } = await supabase.from("admin_promo_codes").insert({
      ...copy,
      code: `${offer.code}-COPY-${Date.now().toString().slice(-4)}`,
      label: `${offer.label} Copy`,
      active: false,
      paddle_synced: false,
      paddle_discount_id: null,
    });
    setNotice(error ? error.message : "Offer duplicated as disabled.");
    if (!error) await load();
  }

  async function deleteOffer(offer: MarketingOffer) {
    if (!window.confirm(`Delete offer ${offer.code}? This cannot be undone.`)) return;
    const { error } = await supabase.from("admin_promo_codes").delete().eq("id", offer.id);
    setNotice(error ? error.message : `${offer.code} deleted.`);
    if (!error) await load();
  }

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950 p-7 text-white shadow-xl">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-violet-300">Revenue controls</p>
        <h1 className="mt-3 text-3xl font-black">Subscriptions, pricing & offers</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Manage plan pricing and every public promotion from this owner-only workspace. No offer is hardcoded on the website.</p>
      </div>

      {notice && <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">{notice}</div>}

      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5 sm:p-6">
          <h2 className="text-xl font-black text-slate-950">Plan editor</h2>
          <p className="mt-1 text-sm text-slate-500">Null limits mean unlimited. Paddle price IDs remain the checkout source of truth.</p>
        </div>
        <div className="grid gap-5 p-5 sm:p-6 xl:grid-cols-3">
          {plans.map((plan, index) => (
            <div key={plan.id} className={`rounded-3xl border p-5 ${plan.popular ? "border-violet-300 bg-violet-50/50 ring-4 ring-violet-100" : "border-slate-200"}`}>
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-xs font-black uppercase tracking-wide text-violet-600">{plan.plan_key}</p><input value={plan.name} onChange={(e) => setPlans((rows) => rows.map((row, i) => i === index ? { ...row, name: e.target.value } : row))} className="mt-1 w-full bg-transparent text-xl font-black text-slate-950 outline-none" /></div>
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
              <button onClick={() => void savePlan(plan)} className="mt-5 w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-violet-600">Save plan</button>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[['Active', counts.active, 'text-emerald-700 bg-emerald-50'], ['Scheduled', counts.scheduled, 'text-blue-700 bg-blue-50'], ['Expired', counts.expired, 'text-amber-700 bg-amber-50'], ['Disabled', counts.disabled, 'text-slate-700 bg-slate-100']].map(([label, value, style]) => (
          <div key={String(label)} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm font-bold text-slate-500">{label}</p><p className={`mt-3 inline-flex rounded-2xl px-4 py-2 text-3xl font-black ${style}`}>{value}</p></div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[430px_1fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between"><h2 className="text-xl font-black text-slate-950">{offerForm.id ? "Edit offer" : "Create offer"}</h2>{offerForm.id && <button onClick={() => setOfferForm(EMPTY_OFFER)} className="text-sm font-bold text-slate-500">Cancel edit</button>}</div>
          <div className="mt-5 space-y-3">
            <input value={offerForm.code} onChange={(e) => setOfferForm({ ...offerForm, code: e.target.value })} placeholder="Code e.g. RIVOX30" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm uppercase" />
            <input value={offerForm.label} onChange={(e) => setOfferForm({ ...offerForm, label: e.target.value })} placeholder="Offer title" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
            <textarea value={offerForm.description} onChange={(e) => setOfferForm({ ...offerForm, description: e.target.value })} placeholder="Short public description" rows={3} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
            <input value={offerForm.badge_text} onChange={(e) => setOfferForm({ ...offerForm, badge_text: e.target.value })} placeholder="Badge text, e.g. Launch offer" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
            <div className="grid grid-cols-2 gap-3">
              <select value={offerForm.discount_type} onChange={(e) => setOfferForm({ ...offerForm, discount_type: e.target.value as OfferForm['discount_type'] })} className="rounded-2xl border border-slate-200 px-3 py-3 text-sm"><option value="percentage">Percentage</option><option value="fixed">Fixed amount</option></select>
              <input type="number" min="0" value={offerForm.discount_value} onChange={(e) => setOfferForm({ ...offerForm, discount_value: e.target.value })} className="rounded-2xl border border-slate-200 px-3 py-3 text-sm" />
              <select value={offerForm.billing_scope} onChange={(e) => setOfferForm({ ...offerForm, billing_scope: e.target.value as OfferForm['billing_scope'] })} className="rounded-2xl border border-slate-200 px-3 py-3 text-sm"><option value="all">Monthly + yearly</option><option value="monthly">Monthly only</option><option value="yearly">Yearly only</option></select>
              <input type="number" min="0" value={offerForm.usage_limit} onChange={(e) => setOfferForm({ ...offerForm, usage_limit: e.target.value })} placeholder="Usage limit" className="rounded-2xl border border-slate-200 px-3 py-3 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3"><label className="text-xs font-bold text-slate-500">Starts<input type="date" value={offerForm.starts_at} onChange={(e) => setOfferForm({ ...offerForm, starts_at: e.target.value })} className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm" /></label><label className="text-xs font-bold text-slate-500">Ends<input type="date" value={offerForm.expires_at} onChange={(e) => setOfferForm({ ...offerForm, expires_at: e.target.value })} className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm" /></label></div>
            <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-black uppercase tracking-wide text-slate-500">Applicable plans</p><div className="mt-3 flex gap-4">{['pro','business'].map((plan) => <label key={plan} className="text-sm font-bold capitalize text-slate-700"><input type="checkbox" checked={offerForm.applies_to.includes(plan)} onChange={() => togglePlan(plan)} className="mr-2" />{plan}</label>)}</div></div>
            <div className="grid grid-cols-2 gap-3"><input type="number" value={offerForm.priority} onChange={(e) => setOfferForm({ ...offerForm, priority: e.target.value })} placeholder="Priority" className="rounded-2xl border border-slate-200 px-3 py-3 text-sm" /><input value={offerForm.paddle_discount_id} onChange={(e) => setOfferForm({ ...offerForm, paddle_discount_id: e.target.value })} placeholder="Paddle discount ID (optional)" className="rounded-2xl border border-slate-200 px-3 py-3 text-sm" /></div>
            <div className="flex flex-wrap gap-5 rounded-2xl border border-slate-200 p-4"><label className="text-sm font-bold text-slate-700"><input type="checkbox" checked={offerForm.featured} onChange={(e) => setOfferForm({ ...offerForm, featured: e.target.checked })} className="mr-2" />Featured</label><label className="text-sm font-bold text-slate-700"><input type="checkbox" checked={offerForm.paddle_synced} onChange={(e) => setOfferForm({ ...offerForm, paddle_synced: e.target.checked })} className="mr-2" />Paddle discount is ready</label></div>
            <button onClick={() => void saveOffer()} disabled={saving} className="w-full rounded-2xl bg-violet-600 px-4 py-3 text-sm font-black text-white hover:bg-violet-500 disabled:opacity-60">{saving ? "Saving..." : offerForm.id ? "Update offer" : "Create offer"}</button>
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5 sm:p-6"><h2 className="text-xl font-black text-slate-950">Dynamic offer library</h2><p className="mt-1 text-sm text-slate-500">Only currently active offers appear on the public Pricing page.</p><div className="mt-4 flex flex-col gap-3 sm:flex-row"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search code or title" className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm" /><select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm"><option value="all">All status</option><option value="active">Active</option><option value="scheduled">Scheduled</option><option value="expired">Expired</option><option value="disabled">Disabled</option></select></div></div>
          <div className="divide-y divide-slate-100">
            {filteredOffers.length === 0 ? <div className="p-10 text-center text-slate-500">No matching offers.</div> : filteredOffers.map((offer) => {
              const status = getOfferStatus(offer);
              return <div key={offer.id} className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div><div className="flex flex-wrap items-center gap-2"><span className="rounded-lg bg-slate-950 px-2.5 py-1 font-mono text-sm font-black text-white">{offer.code}</span><span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${statusStyle(status)}`}>{status}</span>{offer.featured && <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-700">Featured</span>}{offer.paddle_synced ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">Paddle ready</span> : <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">Display only</span>}</div><p className="mt-2 font-bold text-slate-950">{offer.label}</p>{offer.description && <p className="mt-1 text-sm text-slate-500">{offer.description}</p>}<p className="mt-1 text-xs text-slate-500">{offer.discount_value}{offer.discount_type === "percentage" ? "%" : " fixed"} off · {offer.billing_scope} · {offer.applies_to.join(", ")} · priority {offer.priority}</p></div>
                  <div className="flex flex-wrap gap-2"><button onClick={() => editOffer(offer)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">Edit</button><button onClick={() => void duplicateOffer(offer)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">Duplicate</button><button onClick={() => void toggleOffer(offer)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">{offer.active ? "Disable" : "Enable"}</button><button onClick={() => void deleteOffer(offer)} className="rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-600">Delete</button></div>
                </div>
              </div>;
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
