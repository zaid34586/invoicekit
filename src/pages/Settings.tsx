import { useEffect, useState, useRef, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { COUNTRIES } from "../lib/constants";

// ── Per-country auto-derived settings ────────────────────────────────────────
// When businessCountry changes, these values update automatically.
// They are saved to the DB so every other module can read them from profile.
interface CountryConfig {
  currency: string;
  symbol: string;
  code: string;        // dial code
  taxLabel: string;    // label for the tax number field (GSTIN, VAT, ABN…)
  taxPlaceholder: string;
  timezone: string;
  dateFormat: string;
}

const BUSINESS_COUNTRY_CONFIG: Record<string, CountryConfig> = {
  India: {
    currency: "INR", symbol: "₹", code: "+91",
    taxLabel: "GSTIN", taxPlaceholder: "22AAAAA0000A1Z5",
    timezone: "Asia/Kolkata", dateFormat: "DD/MM/YYYY",
  },
  "United States": {
    currency: "USD", symbol: "$", code: "+1",
    taxLabel: "EIN / Tax ID", taxPlaceholder: "12-3456789",
    timezone: "America/New_York", dateFormat: "MM/DD/YYYY",
  },
  "United Kingdom": {
    currency: "GBP", symbol: "£", code: "+44",
    taxLabel: "VAT Number", taxPlaceholder: "GB123456789",
    timezone: "Europe/London", dateFormat: "DD/MM/YYYY",
  },
  Australia: {
    currency: "AUD", symbol: "A$", code: "+61",
    taxLabel: "ABN", taxPlaceholder: "12 345 678 901",
    timezone: "Australia/Sydney", dateFormat: "DD/MM/YYYY",
  },
  UAE: {
    currency: "AED", symbol: "AED", code: "+971",
    taxLabel: "TRN", taxPlaceholder: "100123456700003",
    timezone: "Asia/Dubai", dateFormat: "DD/MM/YYYY",
  },
  Canada: {
    currency: "CAD", symbol: "C$", code: "+1",
    taxLabel: "GST / HST Number", taxPlaceholder: "123456789RT0001",
    timezone: "America/Toronto", dateFormat: "DD/MM/YYYY",
  },
  Singapore: {
    currency: "SGD", symbol: "S$", code: "+65",
    taxLabel: "GST Registration No.", taxPlaceholder: "M90312345A",
    timezone: "Asia/Singapore", dateFormat: "DD/MM/YYYY",
  },
  "South Korea": {
    currency: "KRW", symbol: "₩", code: "+82",
    taxLabel: "Business Registration Number", taxPlaceholder: "000-00-00000",
    timezone: "Asia/Seoul", dateFormat: "YYYY/MM/DD",
  },
};

const DEFAULT_CONFIG = BUSINESS_COUNTRY_CONFIG["India"];

function getConfig(country: string): CountryConfig {
  return BUSINESS_COUNTRY_CONFIG[country] ?? DEFAULT_CONFIG;
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
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

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
      setMessage({ type: "success", text: "Profile saved successfully!" });
      await refreshProfile();
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Business Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          This information appears on your invoices
        </p>
      </div>

      {message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            message.type === "success"
              ? "bg-green-50 border-green-200 text-green-700"
              : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="card p-6 sm:p-8 space-y-6">

        {/* Logo — unchanged */}
        <div>
          <label className="label">Business Logo</label>
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden bg-slate-50">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              )}
            </div>
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleLogoUpload(f);
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="btn-secondary"
              >
                {uploading ? "Uploading..." : "Upload logo"}
              </button>
              {logoUrl && (
                <button
                  type="button"
                  onClick={() => setLogoUrl(null)}
                  className="btn-ghost text-red-500 text-sm ml-2"
                >
                  Remove
                </button>
              )}
              <p className="text-xs text-slate-400 mt-1.5">
                PNG, JPG up to 2MB. Square recommended.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

          {/* Business Name */}
          <div className="sm:col-span-2">
            <label className="label">
              Business Name <span className="text-red-500">*</span>
            </label>
            <input
              required
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="input"
              placeholder="Acme Enterprises"
            />
          </div>

          {/* Business Country */}
          <div>
            <label className="label">Business Country</label>
            <select
              value={businessCountry}
              onChange={(e) => handleCountryChange(e.target.value)}
              className="input"
            >
              {COUNTRIES.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* State — dynamic based on country */}
          <div>
            <label className="label">
              {businessCountry === "United States" ? "State" :
               businessCountry === "Canada" ? "Province" :
               businessCountry === "UAE" ? "Emirate" :
               businessCountry === "United Kingdom" ? "Region" :
               businessCountry === "Australia" ? "State / Territory" :
               "Home State"}
            </label>
            <select
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="input"
              disabled={statesForCountry.length === 0}
            >
              <option value="">
                {statesForCountry.length === 0 ? "Not applicable" : "Select"}
              </option>
              {statesForCountry.map((s: string) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Tax Number — label changes per country, db column stays "gstin" */}
          <div>
            <label className="label">{config.taxLabel}</label>
            <input
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
              className="input"
              placeholder={config.taxPlaceholder}
            />
          </div>

          {/* Phone with auto country code */}
          <div>
            <label className="label">Phone</label>
            <div className="flex gap-2">
              <span className="input w-20 flex-none bg-slate-50 text-slate-500 flex items-center justify-center text-sm font-medium">
                {config.code}
              </span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="input flex-1"
                placeholder="Phone number"
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="business@email.com"
            />
          </div>

          {/* Address */}
          <div className="sm:col-span-2">
            <label className="label">Address</label>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="input"
              rows={3}
              placeholder="Street, City, PIN / ZIP"
            />
          </div>
        </div>

        {/* Auto-derived settings — read only, so user knows what will be saved */}
        <div className="rounded-xl bg-slate-50 border border-slate-200 px-5 py-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
            Auto-detected settings
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Currency</p>
              <p className="font-medium text-slate-700">{config.currency} ({config.symbol})</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Phone Code</p>
              <p className="font-medium text-slate-700">{config.code}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Date Format</p>
              <p className="font-medium text-slate-700">{config.dateFormat}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Timezone</p>
              <p className="font-medium text-slate-700 truncate" title={config.timezone}>
                {config.timezone.split("/")[1]?.replace("_", " ") ?? config.timezone}
              </p>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-3">
            These values are saved automatically when you save your profile.
          </p>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Saving..." : "Save Profile"}
          </button>
        </div>
      </form>
    </div>
  );
}