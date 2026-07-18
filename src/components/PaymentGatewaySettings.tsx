import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import type { Profile } from "../lib/types";

type Connection = {
  id: string;
  provider: "paypal" | "stripe";
  environment: "sandbox" | "live";
  clientIdHint: string;
  accountEmail: string | null;
  accountId: string | null;
  accountCountry: string | null;
  lastVerifiedAt: string | null;
  connectedAt: string;
};

export default function PaymentGatewaySettings({ profile }: { profile: Profile | null }) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [restrictedKey, setRestrictedKey] = useState("");
  const [provider, setProvider] = useState<"paypal" | "stripe">("paypal");
  const [environment, setEnvironment] = useState<"sandbox" | "live">("sandbox");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const paidPlan = profile?.plan === "pro" || profile?.plan === "business" || profile?.is_pro;

  async function callGateway(body: Record<string, unknown>) {
    const { data, error } = await supabase.functions.invoke("payment-gateway", { body });
    if (error) {
      let detail = error.message;
      try {
        const response = (error as { context?: Response }).context;
        if (response) detail = (await response.clone().json())?.error || detail;
      } catch { /* use the function error */ }
      throw new Error(detail);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }

  async function loadStatus() {
    setLoading(true);
    try {
      const data = await callGateway({ action: "status" });
      setConnection(data.connection || null);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Could not load payment settings" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadStatus(); }, []);

  async function connect(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await callGateway({ action: "connect", provider, clientId: clientId.trim(), clientSecret: clientSecret.trim(), restrictedKey: restrictedKey.trim(), environment });
      setClientId("");
      setClientSecret("");
      setRestrictedKey("");
      setMessage({ type: "success", text: `${provider === "paypal" ? "PayPal" : "Stripe"} ${environment === "live" ? "Live" : "Test"} connected. Invoice payments are now ready.` });
      await loadStatus();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "PayPal connection failed" });
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    if (!window.confirm("Disconnect PayPal? Pay Now will be disabled on unpaid invoices.")) return;
    setSaving(true);
    setMessage(null);
    try {
      await callGateway({ action: "disconnect" });
      setConnection(null);
      setMessage({ type: "success", text: "Payment gateway disconnected. Pay Now is disabled; encrypted historical access is retained only for refund webhooks." });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Could not disconnect PayPal" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 bg-gradient-to-r from-slate-950 to-indigo-950 px-6 py-6 text-white sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-300">Invoice payments</p>
          <h2 className="mt-2 text-xl font-black">Payment Gateway</h2>
          <p className="mt-1 text-sm text-slate-300">Receive client payments directly in your own PayPal or Stripe account.</p>
        </div>
        <span className={`w-fit rounded-full px-3 py-1.5 text-xs font-bold ${connection ? "bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-300/30" : "bg-white/10 text-slate-300 ring-1 ring-white/15"}`}>
          {loading ? "Checking…" : connection ? "● Connected" : "Not connected"}
        </span>
      </div>

      <div className="p-6 sm:p-8">
        {message && <div className={`mb-6 rounded-xl border px-4 py-3 text-sm ${message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>{message.text}</div>}

        {!paidPlan ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <h3 className="font-bold text-amber-900">Pro or Business plan required</h3>
            <p className="mt-1 text-sm text-amber-700">Upgrade to activate payment-ready invoice links. You can continue creating and sharing invoices on Free.</p>
            <a href="/billing" className="btn-primary mt-4 inline-flex">View plans</a>
          </div>
        ) : connection ? (
          <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="grid gap-3 sm:grid-cols-3">
              <Info label="Provider" value={connection.provider === "paypal" ? "PayPal Business" : "Stripe"} />
              <Info label="Environment" value={connection.environment === "live" ? "Live payments" : "Sandbox testing"} />
              <Info label="Client ID" value={connection.clientIdHint} />
            </div>
            <button type="button" disabled={saving} onClick={disconnect} className="rounded-xl border border-red-200 px-4 py-3 text-sm font-bold text-red-600 hover:bg-red-50 disabled:opacity-50">
              {saving ? "Disconnecting…" : "Disconnect"}
            </button>
            <div className="lg:col-span-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              ✓ Pay Now is active. Client payments go directly to this {connection.provider === "paypal" ? "PayPal" : "Stripe"} account; Rivox only verifies the result and updates the invoice.
            </div>
          </div>
        ) : (
          <form onSubmit={connect} className="space-y-6">
            <div>
              <p className="label mb-3">Choose payment provider</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={() => setProvider("paypal")} className={`rounded-2xl border p-4 text-left transition ${provider === "paypal" ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100" : "border-slate-200 hover:bg-slate-50"}`}><p className="font-black text-slate-950">PayPal Business</p><p className="mt-1 text-xs text-slate-500">International PayPal checkout</p></button>
                <button type="button" onClick={() => setProvider("stripe")} className={`rounded-2xl border p-4 text-left transition ${provider === "stripe" ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100" : "border-slate-200 hover:bg-slate-50"}`}><p className="font-black text-slate-950">Stripe</p><p className="mt-1 text-xs text-slate-500">Cards and supported local methods</p></button>
              </div>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label className="label">PayPal environment</label>
                <select value={environment} onChange={(event) => setEnvironment(event.target.value as "sandbox" | "live")} className="input h-12">
                  <option value="sandbox">{provider === "paypal" ? "Sandbox" : "Test mode"} — test payments</option>
                  <option value="live">Live — real payments</option>
                </select>
              </div>
              <div className="rounded-2xl bg-indigo-50 p-4 text-sm text-indigo-800">
                Start with {provider === "paypal" ? "Sandbox" : "Test mode"}. Switch to Live only after a full successful payment test and provider verification.
              </div>
              {provider === "paypal" ? <>
              <div>
                <label className="label">PayPal Client ID</label>
                <input value={clientId} onChange={(event) => setClientId(event.target.value)} required autoComplete="off" className="input h-12 font-mono text-sm" placeholder="Paste Client ID" />
              </div>
              <div>
                <label className="label">PayPal Client Secret</label>
                <input type="password" value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} required autoComplete="new-password" className="input h-12 font-mono text-sm" placeholder="Paste Client Secret" />
              </div>
              </> : <div className="md:col-span-2">
                <label className="label">Stripe Restricted API Key</label>
                <input type="password" value={restrictedKey} onChange={(event) => setRestrictedKey(event.target.value)} required autoComplete="new-password" className="input h-12 font-mono text-sm" placeholder={environment === "live" ? "rk_live_…" : "rk_test_…"} />
                <p className="mt-2 text-xs leading-5 text-slate-500">The restricted key needs Account read, Checkout Sessions write/read, Payment Intents read, Charges read, Refunds read, and Webhook Endpoints write permissions.</p>
              </div>}
            </div>
            <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-2xl text-sm leading-6 text-slate-600">Your secret is encrypted before storage, used only by Supabase Edge Functions, and never returned to the browser. Rivox never stores client card details.</p>
              <button type="submit" disabled={saving || (provider === "paypal" ? !clientId.trim() || !clientSecret.trim() : !restrictedKey.trim())} className="btn-primary min-w-40 justify-center">
                {saving ? "Verifying…" : `Connect ${provider === "paypal" ? "PayPal" : "Stripe"}`}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-2 break-all text-sm font-bold text-slate-900">{value}</p></div>;
}
