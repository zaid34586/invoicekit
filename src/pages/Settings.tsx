import { useEffect, useState, useRef, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { COUNTRIES, getCountrySetting } from "../lib/constants";
import PaymentGatewaySettings from "../components/PaymentGatewaySettings";

// ── Per-country auto-derived settings ────────────────────────────────────────
// When businessCountry changes, these values update automatically.
// They are saved to the DB so every other module can read them from profile.
//
// NOTE: this used to be its own hand-picked 8-country map that fell back to
// India's config for anything else — so selecting e.g. Germany would
// silently save INR/Kolkata-timezone into the business profile, and every
// invoice created afterwards inherited that wrong currency. It's now derived
// from constants.ts's COUNTRY_SETTINGS, which covers every country in the
// COUNTRIES dropdown, with a neutral (not-India) fallback that should never
// actually trigger.
interface CountryConfig {
  currency: string;
  symbol: string;
  code: string;        // dial code
  taxLabel: string;    // label for the tax number field (GSTIN, VAT, ABN…)
  taxPlaceholder: string;
  timezone: string;
  dateFormat: string;
}

function getConfig(country: string): CountryConfig {
  const setting = getCountrySetting(country);
  const dial = COUNTRIES.find((c) => c.name === country)?.code ?? "+1";
  return {
    currency: setting.currency,
    symbol: setting.symbol,
    code: dial,
    taxLabel: setting.taxLabel,
    taxPlaceholder: setting.taxPlaceholder,
    timezone: setting.timezone,
    dateFormat: setting.dateFormat,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

export default function Settings() {
  const { user, profile, refreshProfile } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [businessName, setBusinessName] = useState("");
  const [businessCountry, setBusinessCountry] = useState("India");
  const [gstin, setGstin] = useState("");      // tax number — field name stays "gstin" in DB
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState("");
  const [address, setAddress] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [businessStats, setBusinessStats] = useState({ clients: 0, invoices: 0, revenue: 0, paid: 0 });

  // Auto-derived from businessCountry — never manually edited
  const config = getConfig(businessCountry);
  const statesForCountry = COUNTRIES.find((c) => c.name === businessCountry)?.states ?? [];

  // Load existing profile
  useEffect(() => {
    if (profile) {
      setBusinessName(profile.business_name ?? "");
      setBusinessCountry(profile.country ?? "India");
      setGstin(profile.gstin ?? "");
      setPhone(profile.phone ?? "");
      setEmail(profile.email ?? "");
      setState(profile.state ?? "");
      setAddress(profile.address ?? "");
      setLogoUrl(profile.logo_url ?? null);
    }
  }, [profile]);


  useEffect(() => {
    async function loadBusinessStats() {
      if (!user) return;
      const [invoiceRes, clientRes] = await Promise.all([
        supabase.from("invoices").select("status,total,invoice_total").eq("user_id", user.id),
        supabase.from("clients").select("id").eq("user_id", user.id),
      ]);
      const rows = invoiceRes.data ?? [];
      const paidRows = rows.filter((row) => row.status === "paid");
      const revenue = paidRows.reduce((sum, row) => sum + Number(row.invoice_total ?? row.total ?? 0), 0);
      setBusinessStats({ clients: clientRes.data?.length ?? 0, invoices: rows.length, revenue, paid: paidRows.length });
    }
    loadBusinessStats();
  }, [user]);

  // When country changes: reset state (old state may not belong to new country)
  function handleCountryChange(newCountry: string) {
    setBusinessCountry(newCountry);
    setState("");
  }

  async function handleLogoUpload(file: File) {
    if (!user) return;
    setUploading(true);
    setMessage(null);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${user.id}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("logos")
        .upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage
        .from("logos")
        .getPublicUrl(path);
      setLogoUrl(urlData.publicUrl);
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Logo upload failed",
      });
    }
    setUploading(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setMessage(null);

    // All auto-derived fields are saved so every module reads them from profile
    const payload = {
      user_id: user.id,
      business_name: businessName.trim() || null,
      country: businessCountry,
      country_code: config.code,
      currency: config.currency,
      timezone: config.timezone,
      date_format: config.dateFormat,
      gstin: gstin.trim().toUpperCase() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      state: state || null,
      address: address.trim() || null,
      logo_url: logoUrl,
    };

    const { error } = await supabase
      .from("profiles")
      .upsert(payload, { onConflict: "user_id" })
      .select("*")
      .single();

    setSaving(false);
    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMessage({ type: "success", text: "Business profile updated successfully." });
      await refreshProfile();
      setIsEditing(false);
    }
  }

  const profileComplete = Boolean(profile?.business_name && profile?.country);

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-violet-600">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Business profile
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Business Settings</h1>
          <p className="mt-1 text-sm text-slate-500">Manage the identity and regional settings used across invoices, PDFs and emails.</p>
        </div>
        {profileComplete && !isEditing && (
          <button type="button" onClick={() => setIsEditing(true)} className="btn-primary">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
            Edit business profile
          </button>
        )}
      </div>

      {message && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>{message.text}</div>
      )}

      {profileComplete && !isEditing ? (
        <div className="grid gap-6 lg:grid-cols-[1.35fr_.65fr]">
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="relative bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950 p-7 text-white">
              <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-violet-500/20 blur-3xl" />
              <div className="relative flex items-center gap-5">
                <div className="h-20 w-20 overflow-hidden rounded-2xl border border-white/15 bg-white/10 flex items-center justify-center shadow-xl">
                  {logoUrl ? <img src={logoUrl} alt={businessName} className="h-full w-full object-cover" /> : <span className="text-3xl font-bold">{(businessName || "R").slice(0,1).toUpperCase()}</span>}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[.2em] text-violet-300">Your business</p>
                  <h2 className="mt-2 text-3xl font-bold">{businessName || "Business name"}</h2>
                  <p className="mt-1 text-sm text-slate-300">{email || user?.email || "No public email added"}</p>
                </div>
              </div>
            </div>
            <div className="grid gap-px bg-slate-100 sm:grid-cols-2">
              {[
                ["Country", businessCountry],
                ["Region", state || "Not provided"],
                [config.taxLabel, gstin || "Not provided"],
                ["Phone", phone ? `${config.code} ${phone}` : "Not provided"],
                ["Currency", `${config.currency} (${config.symbol})`],
                ["Timezone", config.timezone],
              ].map(([label, value]) => (
                <div key={label} className="bg-white p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900 break-words">{value}</p>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-100 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Business address</p>
              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">{address || "No address added yet."}</p>
            </div>
          </section>

          <aside className="space-y-5">
            <div className="rounded-3xl border border-violet-100 bg-gradient-to-br from-violet-50 to-indigo-50 p-6">
              <div className="flex items-center justify-between"><h3 className="font-semibold text-slate-900">Profile status</h3><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">Active</span></div>
              <div className="mt-5 h-2 rounded-full bg-white"><div className="h-full w-full rounded-full bg-gradient-to-r from-violet-600 to-indigo-500" /></div>
              <p className="mt-3 text-sm text-slate-600">Your business profile is ready and will appear on new invoices.</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-500">Business health</p><h3 className="mt-1 font-semibold text-slate-900">Live workspace summary</h3></div><span className="rounded-xl bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">Rivox</span></div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                {[
                  ["Clients", businessStats.clients.toLocaleString()],
                  ["Invoices", businessStats.invoices.toLocaleString()],
                  ["Paid", businessStats.paid.toLocaleString()],
                  ["Revenue", new Intl.NumberFormat(undefined,{style:"currency",currency:config.currency,maximumFractionDigits:0}).format(businessStats.revenue)],
                ].map(([label,value]) => <div key={label} className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><p className="text-xs font-medium text-slate-400">{label}</p><p className="mt-1 text-lg font-black text-slate-950">{value}</p></div>)}
              </div>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="font-semibold text-slate-900">Applied automatically</h3>
              <ul className="mt-4 space-y-3 text-sm text-slate-600">
                {["Invoice PDFs and previews", "Tax and currency calculations", "Customer emails and shared invoices", "Reports and business analytics"].map((item) => <li key={item} className="flex gap-2"><span className="mt-0.5 text-emerald-500">✓</span>{item}</li>)}
              </ul>
            </div>
          </aside>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50/70 px-6 py-5 sm:px-8 flex items-center justify-between">
            <div><h2 className="text-lg font-bold text-slate-900">{profileComplete ? "Edit business profile" : "Complete your business profile"}</h2><p className="mt-1 text-sm text-slate-500">Changes update your future invoices immediately.</p></div>
            {profileComplete && <button type="button" onClick={() => setIsEditing(false)} className="btn-ghost">Cancel</button>}
          </div>

          <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[240px_1fr]">
            <div>
              <p className="text-sm font-semibold text-slate-900">Brand identity</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">Upload a square logo for the best result on invoices and emails.</p>
              <div className="mt-5 h-32 w-32 overflow-hidden rounded-3xl border-2 border-dashed border-violet-200 bg-violet-50 flex items-center justify-center">
                {logoUrl ? <img src={logoUrl} alt="Logo" className="h-full w-full object-cover" /> : <span className="text-4xl font-bold text-violet-500">{(businessName || "R").slice(0,1).toUpperCase()}</span>}
              </div>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/jpg,image/webp" className="hidden" onChange={(e) => { const f=e.target.files?.[0]; if(f) handleLogoUpload(f); }} />
              <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="btn-secondary">{uploading ? "Uploading..." : "Upload logo"}</button>{logoUrl && <button type="button" onClick={() => setLogoUrl(null)} className="btn-ghost text-red-500">Remove</button>}</div>
            </div>

            <div className="space-y-7">
              <section><h3 className="text-sm font-semibold text-slate-900">Company information</h3><div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div className="sm:col-span-2"><label className="label">Business Name <span className="text-red-500">*</span></label><input required value={businessName} onChange={(e)=>setBusinessName(e.target.value)} className="input h-12" placeholder="Acme Enterprises" /></div>
                <div><label className="label">Business Country</label><select value={businessCountry} onChange={(e)=>handleCountryChange(e.target.value)} className="input h-12">{COUNTRIES.map((c)=><option key={c.name} value={c.name}>{c.name}</option>)}</select></div>
                <div><label className="label">{businessCountry === "Canada" ? "Province" : businessCountry === "UAE" ? "Emirate" : businessCountry === "United Kingdom" ? "Region" : "State / Region"}</label><select value={state} onChange={(e)=>setState(e.target.value)} className="input h-12" disabled={statesForCountry.length===0}><option value="">{statesForCountry.length===0 ? "Not applicable" : "Select"}</option>{statesForCountry.map((s:string)=><option key={s} value={s}>{s}</option>)}</select></div>
                <div><label className="label">{config.taxLabel}</label><input value={gstin} onChange={(e)=>setGstin(e.target.value.toUpperCase())} className="input h-12" placeholder={config.taxPlaceholder} /></div>
                <div><label className="label">Phone</label><div className="flex gap-2"><span className="input h-12 w-20 flex-none bg-slate-50 text-slate-500 flex items-center justify-center">{config.code}</span><input value={phone} onChange={(e)=>setPhone(e.target.value)} className="input h-12" placeholder="Phone number" /></div></div>
                <div className="sm:col-span-2"><label className="label">Business Email</label><input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} className="input h-12" placeholder="billing@business.com" /></div>
                <div className="sm:col-span-2"><label className="label">Address</label><textarea value={address} onChange={(e)=>setAddress(e.target.value)} className="input" rows={4} placeholder="Street, City, PIN / ZIP" /></div>
              </div></section>

              <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5"><div className="flex items-center justify-between"><div><h3 className="text-sm font-semibold text-slate-900">Regional configuration</h3><p className="mt-1 text-xs text-slate-500">Updated automatically from your country.</p></div><span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-violet-600 shadow-sm">Auto</span></div><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{[["Currency",`${config.currency} (${config.symbol})`],["Phone code",config.code],["Date format",config.dateFormat],["Timezone",config.timezone.split("/")[1]?.replace("_"," ") ?? config.timezone]].map(([label,value])=><div key={label} className="rounded-xl bg-white p-3"><p className="text-xs text-slate-400">{label}</p><p className="mt-1 truncate text-sm font-semibold text-slate-800" title={value}>{value}</p></div>)}</div></section>
            </div>
          </div>
          <div className="sticky bottom-0 flex justify-end gap-3 border-t border-slate-100 bg-white/95 px-6 py-4 backdrop-blur sm:px-8"><button type="submit" disabled={saving} className="btn-primary min-w-36 justify-center">{saving ? "Saving..." : profileComplete ? "Save changes" : "Complete setup"}</button></div>
        </form>
      )}
      <PaymentGatewaySettings profile={profile} />
    </div>
  );
}
