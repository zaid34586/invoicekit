import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { BannersTab, CampaignsTab, GrowthAnalyticsTab } from "./AdminGrowthModules";
import { archiveOfferInPaddle, syncOfferWithPaddle, testOfferInPaddle } from "../lib/paddleOffers";

type Tab = "offers" | "campaigns" | "banners" | "analytics";
type Offer = {
  id: string; code: string; label: string; description: string | null; badge_text: string | null;
  discount_type: "percentage" | "fixed"; discount_value: number; applies_to: string[];
  billing_scope: "monthly" | "yearly" | "all"; starts_at: string | null; expires_at: string | null;
  active: boolean; featured: boolean; priority: number; usage_limit: number | null; usage_count: number;
  paddle_discount_id: string | null; paddle_synced: boolean; paddle_sync_status: "not_synced" | "syncing" | "synced" | "error" | "archived";
  paddle_last_synced_at: string | null; paddle_last_error: string | null; paddle_recur: boolean;
  paddle_max_recurring_intervals: number | null; paddle_currency_code: string; paddle_restrict_to: string[]; created_at: string;
};

type FormState = {
  code: string; label: string; description: string; badge_text: string; discount_type: "percentage" | "fixed";
  discount_value: string; applies_to: string[]; billing_scope: "monthly" | "yearly" | "all";
  starts_at: string; expires_at: string; active: boolean; featured: boolean; priority: string;
  usage_limit: string; paddle_discount_id: string; paddle_recur: boolean; paddle_max_recurring_intervals: string; paddle_currency_code: string;
};

const emptyForm: FormState = {
  code: "", label: "", description: "", badge_text: "", discount_type: "percentage", discount_value: "20",
  applies_to: ["pro", "business"], billing_scope: "all", starts_at: "", expires_at: "", active: true,
  featured: false, priority: "0", usage_limit: "", paddle_discount_id: "", paddle_recur: false, paddle_max_recurring_intervals: "", paddle_currency_code: "USD",
};

function statusOf(offer: Offer) {
  const now = Date.now();
  if (!offer.active) return "Disabled";
  if (offer.starts_at && new Date(offer.starts_at).getTime() > now) return "Scheduled";
  if (offer.expires_at && new Date(offer.expires_at).getTime() < now) return "Expired";
  return "Active";
}

function badgeClass(status: string) {
  if (status === "Active") return "bg-emerald-50 text-emerald-700";
  if (status === "Scheduled") return "bg-blue-50 text-blue-700";
  if (status === "Expired") return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

export default function AdminGrowthCenter() {
  const [tab, setTab] = useState<Tab>("offers");
  const [offers, setOffers] = useState<Offer[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  async function loadOffers() {
    setLoading(true);
    const { data, error } = await supabase.from("admin_promo_codes").select("*").order("priority", { ascending: false }).order("created_at", { ascending: false });
    setLoading(false);
    if (error) { setNotice(error.message); return; }
    setOffers((data ?? []) as Offer[]);
  }

  useEffect(() => { loadOffers(); }, []);

  const visible = useMemo(() => offers.filter((offer) => {
    const text = `${offer.code} ${offer.label} ${offer.description ?? ""}`.toLowerCase();
    const status = statusOf(offer).toLowerCase();
    return text.includes(query.toLowerCase()) && (filter === "all" || status === filter);
  }), [offers, query, filter]);

  const counts = useMemo(() => ({
    active: offers.filter((o) => statusOf(o) === "Active").length,
    scheduled: offers.filter((o) => statusOf(o) === "Scheduled").length,
    expired: offers.filter((o) => statusOf(o) === "Expired").length,
    redemptions: offers.reduce((sum, o) => sum + Number(o.usage_count || 0), 0),
  }), [offers]);

  function reset() { setForm(emptyForm); setEditingId(null); }

  function edit(offer: Offer) {
    setEditingId(offer.id);
    setForm({
      code: offer.code, label: offer.label, description: offer.description ?? "", badge_text: offer.badge_text ?? "",
      discount_type: offer.discount_type, discount_value: String(offer.discount_value), applies_to: offer.applies_to ?? [],
      billing_scope: offer.billing_scope, starts_at: offer.starts_at ? offer.starts_at.slice(0, 16) : "",
      expires_at: offer.expires_at ? offer.expires_at.slice(0, 16) : "", active: offer.active, featured: offer.featured,
      priority: String(offer.priority ?? 0), usage_limit: offer.usage_limit == null ? "" : String(offer.usage_limit),
      paddle_discount_id: offer.paddle_discount_id ?? "", paddle_recur: Boolean(offer.paddle_recur),
      paddle_max_recurring_intervals: offer.paddle_max_recurring_intervals == null ? "" : String(offer.paddle_max_recurring_intervals),
      paddle_currency_code: offer.paddle_currency_code || "USD",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save() {
    const code = form.code.trim().toUpperCase();
    if (!code || !form.label.trim()) { setNotice("Code and offer title are required."); return; }
    const payload = {
      code, label: form.label.trim(), description: form.description.trim() || null, badge_text: form.badge_text.trim() || null,
      discount_type: form.discount_type, discount_value: Number(form.discount_value), applies_to: form.applies_to,
      billing_scope: form.billing_scope, starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null, active: form.active,
      featured: form.featured, priority: Number(form.priority || 0), usage_limit: form.usage_limit ? Number(form.usage_limit) : null,
      paddle_discount_id: form.paddle_discount_id.trim() || null, paddle_synced: Boolean(form.paddle_discount_id.trim()),
      updated_at: new Date().toISOString(),
    };
    const enrichedPayload = {
      ...payload,
      paddle_recur: form.paddle_recur,
      paddle_max_recurring_intervals: form.paddle_recur && form.paddle_max_recurring_intervals ? Number(form.paddle_max_recurring_intervals) : null,
      paddle_currency_code: form.paddle_currency_code || "USD",
      paddle_sync_status: form.paddle_discount_id.trim() ? "synced" : "not_synced",
    };
    const result = editingId
      ? await supabase.from("admin_promo_codes").update(enrichedPayload).eq("id", editingId).select("id").single()
      : await supabase.from("admin_promo_codes").insert(enrichedPayload).select("id").single();
    if (result.error) { setNotice(result.error.message); return; }
    const savedId = result.data?.id || editingId;
    setNotice(editingId ? "Offer saved. Sync it to Paddle when ready." : "Offer created. Sync it to Paddle to make checkout discount live.");
    reset(); await loadOffers();
    if (savedId && form.active) await syncPaddle(savedId);
  }


  async function syncPaddle(id: string) {
    setSyncingId(id);
    setNotice("Syncing offer with Paddle…");
    try {
      const result = await syncOfferWithPaddle(id);
      setNotice(`Paddle discount ${result.code || ""} synced successfully.`);
      await loadOffers();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Paddle sync failed.");
      await loadOffers();
    } finally {
      setSyncingId(null);
    }
  }

  async function testPaddle(offer: Offer) {
    setSyncingId(offer.id);
    try {
      const result = await testOfferInPaddle(offer.id);
      setNotice(`Paddle verified: ${result.code || offer.code} is ${result.status || "available"}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Paddle verification failed.");
    } finally { setSyncingId(null); }
  }

  async function archivePaddle(offer: Offer) {
    if (!window.confirm(`Archive ${offer.code} in Paddle and disable it in Rivox?`)) return;
    setSyncingId(offer.id);
    try {
      await archiveOfferInPaddle(offer.id);
      setNotice(`${offer.code} archived in Paddle.`);
      await loadOffers();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to archive Paddle discount.");
    } finally { setSyncingId(null); }
  }

  async function toggle(offer: Offer) {
    const { error } = await supabase.from("admin_promo_codes").update({ active: !offer.active, updated_at: new Date().toISOString() }).eq("id", offer.id);
    setNotice(error ? error.message : `${offer.code} ${offer.active ? "disabled" : "enabled"}.`);
    if (!error) await loadOffers();
  }

  async function duplicate(offer: Offer) {
    const { id, created_at, usage_count, ...copy } = offer;
    const { error } = await supabase.from("admin_promo_codes").insert({ ...copy, code: `${offer.code}-COPY-${Date.now().toString().slice(-4)}`, label: `${offer.label} Copy`, active: false, usage_count: 0, updated_at: new Date().toISOString() });
    setNotice(error ? error.message : "Offer duplicated as disabled draft.");
    if (!error) await loadOffers();
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this offer permanently?")) return;
    const { error } = await supabase.from("admin_promo_codes").delete().eq("id", id);
    setNotice(error ? error.message : "Offer deleted.");
    if (!error) await loadOffers();
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "offers", label: "Offers" }, { id: "campaigns", label: "Campaigns" },
    { id: "banners", label: "Banners" }, { id: "analytics", label: "Analytics" },
  ];

  return <div className="space-y-6">
    <div className="rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950 p-7 text-white shadow-xl">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-300">Growth Center</p>
      <h1 className="mt-3 text-3xl font-black">Offers, campaigns and conversion controls</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Create offers once, schedule them, target the right plan, and show them automatically across Rivox without code changes.</p>
    </div>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[['Active offers', counts.active], ['Scheduled', counts.scheduled], ['Expired', counts.expired], ['Redemptions', counts.redemptions]].map(([label, value]) =>
        <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-3xl font-black text-slate-950">{value}</p></div>)}
    </div>

    <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
      {tabs.map((item) => <button key={item.id} onClick={() => setTab(item.id)} className={`rounded-xl px-4 py-2 text-sm font-bold ${tab === item.id ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{item.label}</button>)}
    </div>

    {notice && <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800">{notice}</div>}

    {tab === "offers" && <>
      <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between"><div><h2 className="text-xl font-black text-slate-950">{editingId ? 'Edit offer' : 'Create offer'}</h2><p className="mt-1 text-sm text-slate-500">Displayed inside matching pricing cards.</p></div>{editingId && <button onClick={reset} className="text-sm font-bold text-slate-500">Cancel</button>}</div>
          <div className="mt-5 space-y-3">
            <div className="grid grid-cols-2 gap-3"><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="Promo code" className="rounded-2xl border px-4 py-3 text-sm uppercase"/><input value={form.badge_text} onChange={(e) => setForm({ ...form, badge_text: e.target.value })} placeholder="Badge text" className="rounded-2xl border px-4 py-3 text-sm"/></div>
            <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Offer title" className="w-full rounded-2xl border px-4 py-3 text-sm"/>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" rows={3} className="w-full rounded-2xl border px-4 py-3 text-sm"/>
            <div className="grid grid-cols-2 gap-3"><select value={form.discount_type} onChange={(e) => setForm({ ...form, discount_type: e.target.value as FormState['discount_type'] })} className="rounded-2xl border px-3 py-3 text-sm"><option value="percentage">Percentage</option><option value="fixed">Fixed amount</option></select><input type="number" value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: e.target.value })} className="rounded-2xl border px-3 py-3 text-sm"/></div>
            <div className="grid grid-cols-2 gap-3"><select value={form.billing_scope} onChange={(e) => setForm({ ...form, billing_scope: e.target.value as FormState['billing_scope'] })} className="rounded-2xl border px-3 py-3 text-sm"><option value="all">Monthly + yearly</option><option value="monthly">Monthly only</option><option value="yearly">Yearly only</option></select><input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} placeholder="Priority" className="rounded-2xl border px-3 py-3 text-sm"/></div>
            <div className="rounded-2xl border border-slate-200 p-3"><p className="text-xs font-black uppercase text-slate-500">Plans</p><div className="mt-2 flex gap-4">{['pro','business'].map((plan) => <label key={plan} className="text-sm font-bold capitalize"><input type="checkbox" checked={form.applies_to.includes(plan)} onChange={(e) => setForm({ ...form, applies_to: e.target.checked ? [...form.applies_to, plan] : form.applies_to.filter((p) => p !== plan) })} className="mr-2"/>{plan}</label>)}</div></div>
            <div className="grid grid-cols-2 gap-3"><label className="text-xs font-bold text-slate-500">Starts<input type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} className="mt-1 w-full rounded-2xl border px-3 py-3 text-sm"/></label><label className="text-xs font-bold text-slate-500">Ends<input type="datetime-local" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} className="mt-1 w-full rounded-2xl border px-3 py-3 text-sm"/></label></div>
            <div className="grid grid-cols-2 gap-3"><input type="number" value={form.usage_limit} onChange={(e) => setForm({ ...form, usage_limit: e.target.value })} placeholder="Total redemption limit" className="rounded-2xl border px-3 py-3 text-sm"/><select value={form.paddle_currency_code} onChange={(e) => setForm({ ...form, paddle_currency_code: e.target.value })} className="rounded-2xl border px-3 py-3 text-sm"><option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option><option value="INR">INR</option></select></div><div className="rounded-2xl border border-slate-200 p-3"><div className="flex items-center justify-between gap-3"><label className="text-sm font-bold"><input type="checkbox" checked={form.paddle_recur} onChange={(e) => setForm({ ...form, paddle_recur: e.target.checked })} className="mr-2"/>Apply on renewals</label>{form.paddle_recur && <input type="number" min="1" value={form.paddle_max_recurring_intervals} onChange={(e) => setForm({ ...form, paddle_max_recurring_intervals: e.target.value })} placeholder="Billing periods (blank = forever)" className="w-52 rounded-xl border px-3 py-2 text-xs"/>}</div>{form.paddle_discount_id && <p className="mt-2 break-all text-xs text-slate-500">Paddle ID: {form.paddle_discount_id}</p>}</div>
            <div className="flex gap-5"><label className="text-sm font-bold"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="mr-2"/>Active</label><label className="text-sm font-bold"><input type="checkbox" checked={form.featured} onChange={(e) => setForm({ ...form, featured: e.target.checked })} className="mr-2"/>Featured</label></div>
            <button onClick={save} className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-violet-600">{editingId ? 'Save changes' : 'Create offer'}</button>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-black text-slate-950">Offer library</h2><p className="text-sm text-slate-500">Search, filter, duplicate and schedule promotions.</p></div><div className="flex gap-2"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="rounded-xl border px-3 py-2 text-sm"/><select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-xl border px-3 py-2 text-sm"><option value="all">All</option><option value="active">Active</option><option value="scheduled">Scheduled</option><option value="expired">Expired</option><option value="disabled">Disabled</option></select></div></div>
          <div className="divide-y divide-slate-100">{loading ? <p className="p-8 text-center text-slate-500">Loading offers…</p> : visible.length === 0 ? <p className="p-10 text-center text-slate-500">No matching offers.</p> : visible.map((offer) => { const status = statusOf(offer); return <div key={offer.id} className="p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="rounded-lg bg-slate-950 px-2.5 py-1 font-mono text-xs font-black text-white">{offer.code}</span><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${badgeClass(status)}`}>{status}</span>{offer.featured && <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-700">Featured</span>}{offer.paddle_synced && <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-bold text-cyan-700">Paddle ready</span>}{offer.paddle_sync_status === 'error' && <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">Sync error</span>}</div><p className="mt-2 font-black text-slate-950">{offer.label}</p><p className="mt-1 text-sm text-slate-500">{offer.discount_value}{offer.discount_type === 'percentage' ? '%' : ''} off · {offer.billing_scope} · {(offer.applies_to ?? []).join(', ')}</p>{offer.paddle_last_error && <p className="mt-1 max-w-xl text-xs font-medium text-red-600">{offer.paddle_last_error}</p>}</div><div className="flex flex-wrap gap-2"><button onClick={() => syncPaddle(offer.id)} disabled={syncingId === offer.id} className="rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-bold text-cyan-700 disabled:opacity-50">{syncingId === offer.id ? 'Syncing…' : offer.paddle_synced ? 'Re-sync Paddle' : 'Sync Paddle'}</button>{offer.paddle_synced && <button onClick={() => testPaddle(offer)} className="rounded-xl border px-3 py-2 text-xs font-bold">Test</button>}<button onClick={() => edit(offer)} className="rounded-xl border px-3 py-2 text-xs font-bold">Edit</button><button onClick={() => duplicate(offer)} className="rounded-xl border px-3 py-2 text-xs font-bold">Duplicate</button><button onClick={() => toggle(offer)} className="rounded-xl border px-3 py-2 text-xs font-bold">{offer.active ? 'Disable' : 'Enable'}</button>{offer.paddle_synced && <button onClick={() => archivePaddle(offer)} className="rounded-xl border border-amber-200 px-3 py-2 text-xs font-bold text-amber-700">Archive</button>}<button onClick={() => remove(offer.id)} className="rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-600">Delete</button></div></div></div>; })}</div>
        </div>
      </section>
    </>}

    {tab === "campaigns" && <CampaignsTab />}
    {tab === "banners" && <BannersTab />}
    {tab === "analytics" && <GrowthAnalyticsTab />}
  </div>;
}
