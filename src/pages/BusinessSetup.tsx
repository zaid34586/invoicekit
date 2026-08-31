import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { GLOBAL_COUNTRIES, getGlobalCountryConfig } from "../lib/globalConfig";
import CountrySelect from "../components/CountrySelect";

export default function BusinessSetup() {
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [country, setCountry] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const config = country ? getGlobalCountryConfig(country) : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!country || !(country in GLOBAL_COUNTRIES)) {
      setError("Please select your business country to continue.");
      return;
    }
    setSaving(true);
    setError(null);
    const cfg = getGlobalCountryConfig(country);
    const { data: savedProfile, error: updateError } = await supabase
      .from("profiles")
      .upsert({
        user_id: user.id,
        email: user.email ?? null,
        business_name: businessName.trim() || null,
        country,
        country_code: cfg.phoneCode,
        currency: cfg.currency,
        timezone: cfg.timezone,
        date_format: cfg.dateFormat,
      }, { onConflict: "user_id" })
      .select("user_id, country")
      .single();
    setSaving(false);
    if (updateError || !savedProfile?.country) {
      setError(updateError?.message || "Business setup could not be saved. Please try again.");
      return;
    }
    const refreshed = await refreshProfile();
    if (!refreshed?.country) {
      setError("Business setup was saved but could not be loaded. Please refresh and try again.");
      return;
    }
    // Phone/OTP verification is disabled for now, so we skip
    // straight to the dashboard instead of /verify-phone.
    navigate("/dashboard", { replace: true });
  }

  return (
    <div className="auth-page">
      <div className="auth-shell">
        <section className="auth-aside">
          <div>
            <div className="inline-flex items-center gap-3">
              <img src="/rivox-logo.svg" alt="Rivox" className="h-10 w-10 rounded-xl" />
              <span className="text-2xl font-bold tracking-tight">Rivox</span>
            </div>
            <div className="mt-16 max-w-md">
              <p className="text-sm font-semibold uppercase tracking-[.24em] text-violet-300">Business setup</p>
              <h1 className="mt-4 text-4xl font-bold leading-tight">Set up once. Invoice professionally everywhere.</h1>
              <p className="mt-5 text-base leading-7 text-slate-300">Rivox uses your country to configure currency, tax labels, date formats and phone codes automatically.</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs text-slate-300">
            {["Global currencies", "Smart tax fields", "Editable anytime"].map((item) => (
              <div key={item} className="rounded-xl border border-white/10 bg-white/5 p-3">{item}</div>
            ))}
          </div>
        </section>

        <section className="auth-content">
          <div className="mb-6 flex min-w-0 items-start justify-between gap-3 sm:mb-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.2em] text-violet-600">Step 1 of 2</p>
              <h2 className="mt-2 auth-heading font-bold text-slate-950">Tell us about your business</h2>
              <p className="mt-2 text-sm text-slate-500">You can edit every detail later from Business Settings.</p>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-violet-50 text-violet-600 flex items-center justify-center font-bold">1/2</div>
          </div>

          <div className="mb-8 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-violet-600 to-indigo-500" />
          </div>

          {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="label" htmlFor="businessName">Business name</label>
              <input id="businessName" type="text" value={businessName} onChange={(e) => setBusinessName(e.target.value)} className="input h-12" placeholder="Acme Studio" />
              <p className="mt-1.5 text-xs text-slate-400">This name appears on invoices and customer communications.</p>
            </div>

            <div>
              <label className="label" htmlFor="country">Business country</label>
              <CountrySelect id="country" value={country} onChange={setCountry} placeholder="Select your country" required />
            </div>

            {config && (
              <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 to-indigo-50 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Your regional setup</p>
                    <p className="text-xs text-slate-500">Configured automatically by Rivox</p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-violet-700 shadow-sm">Ready</span>
                </div>
                <div className="grid grid-cols-1 gap-2 text-sm min-[420px]:grid-cols-3 sm:gap-3">
                  <div className="rounded-xl bg-white p-3"><p className="text-xs text-slate-400">Currency</p><p className="mt-1 font-semibold text-slate-900">{config.currency}</p></div>
                  <div className="rounded-xl bg-white p-3"><p className="text-xs text-slate-400">Phone</p><p className="mt-1 font-semibold text-slate-900">{config.phoneCode}</p></div>
                  <div className="rounded-xl bg-white p-3"><p className="text-xs text-slate-400">Tax</p><p className="mt-1 font-semibold text-slate-900 truncate">{config.taxLabel}</p></div>
                </div>
              </div>
            )}

            <button type="submit" className="btn-primary h-12 w-full justify-center text-base" disabled={saving || !country}>
              {saving ? "Saving your setup..." : "Continue to verification"}
            </button>
            <p className="text-center text-xs text-slate-400">Your details are encrypted and can be updated later.</p>
          </form>
        </section>
      </div>
    </div>
  );
}
