import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { getPaddleConfigurationStatus, getPaddle } from "../lib/paddle";

type PaddleStatus = {
  configured: boolean;
  last_four: string | null;
  expires_at: string | null;
  updated_at: string | null;
  connection_status: "connected" | "not_configured" | "error";
  last_tested_at: string | null;
  last_error: string | null;
};

const emptyStatus: PaddleStatus = {
  configured: false,
  last_four: null,
  expires_at: null,
  updated_at: null,
  connection_status: "not_configured",
  last_tested_at: null,
  last_error: null,
};

function daysUntil(value: string | null) {
  if (!value) return null;
  return Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000);
}

function healthStyle(days: number | null) {
  if (days === null) return "bg-slate-100 text-slate-700 border-slate-200";
  if (days <= 1) return "bg-red-100 text-red-800 border-red-200";
  if (days <= 7) return "bg-rose-50 text-rose-700 border-rose-200";
  if (days <= 15) return "bg-orange-50 text-orange-700 border-orange-200";
  if (days <= 30) return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-emerald-50 text-emerald-700 border-emerald-200";
}

export default function AdminPaddleSettings() {
  const [status, setStatus] = useState<PaddleStatus>(emptyStatus);
  const [apiKey, setApiKey] = useState("");
  const [expiry, setExpiry] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const localConfig = getPaddleConfigurationStatus();
  const days = useMemo(() => daysUntil(status.expires_at), [status.expires_at]);

  async function callAdminFunction(action: string, payload: Record<string, unknown> = {}) {
    const { data, error } = await supabase.functions.invoke("paddle-admin-settings", {
      body: { action, ...payload },
    });
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error || "Paddle admin request failed.");
    return data;
  }

  async function load() {
    try {
      const data = await callAdminFunction("status");
      setStatus({ ...emptyStatus, ...data.status });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Deploy the paddle-admin-settings Edge Function first.");
    }
  }

  useEffect(() => { load(); }, []);

  async function saveKey() {
    if (!apiKey.trim() || !expiry) {
      setNotice("Paste the new Paddle API key and select its expiry date.");
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const data = await callAdminFunction("update_key", { api_key: apiKey.trim(), expires_at: new Date(`${expiry}T23:59:59Z`).toISOString() });
      setStatus({ ...emptyStatus, ...data.status });
      setApiKey("");
      setExpiry("");
      setNotice("Paddle API key encrypted, saved and verified. No Vercel redeploy is required for future server-side Paddle actions.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to update Paddle key.");
    } finally {
      setBusy(false);
    }
  }

  async function testServerConnection() {
    setBusy(true);
    setNotice(null);
    try {
      const data = await callAdminFunction("test");
      setStatus({ ...emptyStatus, ...data.status });
      setNotice("Server connection to Paddle is healthy.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Paddle server connection failed.");
    } finally {
      setBusy(false);
    }
  }

  async function testCheckout() {
    setBusy(true);
    setNotice(null);
    try {
      await getPaddle();
      setNotice("Paddle.js frontend connection is healthy. Checkout tokens and price IDs are available.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Paddle.js connection failed.");
    } finally {
      setBusy(false);
    }
  }

  const healthLabel = days === null ? "Expiry not recorded" : days < 0 ? "Expired" : `${days} days remaining`;

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-950 p-7 text-white shadow-xl">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-violet-300">Payment infrastructure</p>
        <h1 className="mt-3 text-3xl font-black">Paddle connection & API key health</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Monitor expiry, securely rotate the backend key, and test both server and checkout connections from the owner dashboard.</p>
      </div>

      {notice && <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">{notice}</div>}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-black uppercase text-slate-400">Server status</p><p className="mt-3 text-2xl font-black text-slate-950">{status.connection_status === "connected" ? "Connected" : "Needs setup"}</p><p className="mt-1 text-sm text-slate-500">{status.last_four ? `Key ending ••••${status.last_four}` : "No encrypted key saved"}</p></div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-black uppercase text-slate-400">Expiry date</p><p className="mt-3 text-2xl font-black text-slate-950">{status.expires_at ? new Date(status.expires_at).toLocaleDateString("en-IN") : "Not set"}</p><p className="mt-1 text-sm text-slate-500">Rotate before this date</p></div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-black uppercase text-slate-400">Key health</p><span className={`mt-3 inline-flex rounded-full border px-3 py-1.5 text-sm font-black ${healthStyle(days)}`}>{healthLabel}</span><p className="mt-2 text-xs text-slate-500">Warnings at 30, 15, 7 and 1 day</p></div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-black uppercase text-slate-400">Frontend checkout</p><p className="mt-3 text-2xl font-black text-slate-950">{localConfig.configured ? "Ready" : "Missing values"}</p><p className="mt-1 text-xs text-slate-500">{localConfig.configured ? "Client token + 4 price IDs found" : localConfig.missing.join(", ")}</p></div>
      </section>

      {days !== null && days <= 30 && (
        <div className={`rounded-2xl border px-5 py-4 text-sm font-bold ${healthStyle(days)}`}>
          {days <= 1 ? "Critical: rotate the Paddle API key immediately." : days <= 7 ? "Urgent: Paddle API key expires within 7 days." : days <= 15 ? "Action needed: rotate the key within 15 days." : "Reminder: Paddle API key expires within 30 days."}
        </div>
      )}

      <section className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black text-slate-950">Update API key</h2>
          <p className="mt-1 text-sm text-slate-500">The full key is sent only to an owner-only Supabase Edge Function, encrypted there, and never stored in the browser.</p>
          <div className="mt-5 space-y-4">
            <label className="block text-sm font-bold text-slate-700">New Paddle API key<input type="password" autoComplete="new-password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="pdl_live_apikey_…" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-mono text-sm" /></label>
            <label className="block text-sm font-bold text-slate-700">Expires on<input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" /></label>
            <button disabled={busy} onClick={saveKey} className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-violet-600 disabled:opacity-50">{busy ? "Working…" : "Encrypt, save & verify key"}</button>
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black text-slate-950">Connection tests</h2>
          <p className="mt-1 text-sm text-slate-500">Run these checks after rotating a key or changing Paddle environment variables.</p>
          <div className="mt-5 space-y-3">
            <button disabled={busy} onClick={testServerConnection} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-left text-sm font-black text-slate-800 hover:bg-slate-50 disabled:opacity-50">Test backend API connection</button>
            <button disabled={busy} onClick={testCheckout} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-left text-sm font-black text-slate-800 hover:bg-slate-50 disabled:opacity-50">Verify Paddle.js checkout setup</button>
          </div>
          <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-xs leading-5 text-slate-600"><strong>Security:</strong> the page displays only the last four characters. Do not put the backend API key in any variable beginning with <code>VITE_</code>.</div>
        </div>
      </section>
    </div>
  );
}
