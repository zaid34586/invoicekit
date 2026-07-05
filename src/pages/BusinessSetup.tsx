import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { GLOBAL_COUNTRIES, getGlobalCountries, getGlobalCountryConfig } from "../lib/globalConfig";

// Priority 1/2 fix: this page guarantees profile.country, country_code,
// currency, and timezone are all set BEFORE the user can ever reach
// /verify-phone. It does not replace or redesign the existing routing —
// it plugs into the same PublicOnlyRoute/ProtectedRoute/PhoneRoute pattern
// already used in App.tsx (see BusinessSetupRoute there).
export default function BusinessSetup() {
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [country, setCountry] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const config = country ? getGlobalCountryConfig(country) : null;
  const countries = getGlobalCountries();

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

    const { error: upsertError } = await supabase
      .from("profiles")
      .update({
        business_name: businessName.trim() || null,
        country,
        country_code: cfg.phoneCode,
        currency: cfg.currency,
        timezone: cfg.timezone,
        date_format: cfg.dateFormat,
      })
      .eq("user_id", user.id);

    setSaving(false);

    if (upsertError) {
      setError(upsertError.message);
      return;
    }

    await refreshProfile();
    navigate("/verify-phone", { replace: true });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="card p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-7 h-7 text-primary-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">
            Where is your business based?
          </h1>
          <p className="text-sm text-slate-500">
            This sets your currency, phone code, and tax fields automatically.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="businessName">
              Business name (optional)
            </label>
            <input
              id="businessName"
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="input"
              placeholder="Acme Studio"
            />
          </div>

          <div>
            <label className="label" htmlFor="country">
              Business country
            </label>
            <select
              id="country"
              className="input"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              required
            >
              <option value="" disabled>
                Select your country
              </option>
              {countries.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {config && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-600 space-y-1">
              <p>
                Currency: <span className="font-medium text-slate-900">{config.currency} ({config.symbol})</span>
              </p>
              <p>
                Phone code: <span className="font-medium text-slate-900">{config.phoneCode}</span>
              </p>
              <p>
                Tax field: <span className="font-medium text-slate-900">{config.taxLabel}</span>
              </p>
            </div>
          )}

          <button type="submit" className="btn-primary w-full" disabled={saving || !country}>
            {saving ? "Saving..." : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}