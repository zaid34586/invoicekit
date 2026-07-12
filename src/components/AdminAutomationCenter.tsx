import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type AutomationRule = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  event_type: "due_reminder" | "overdue_reminder" | "payment_thank_you";
  enabled: boolean;
  offset_days: number;
  subject_template: string;
  body_template: string;
  send_email: boolean;
  create_admin_notification: boolean;
  updated_at: string;
};

type AutomationRun = {
  id: string;
  rule_key: string;
  invoice_id: string | null;
  recipient_email: string | null;
  status: "sent" | "skipped" | "failed" | "simulated";
  scheduled_for: string | null;
  error_message: string | null;
  created_at: string;
};

const statusStyles: Record<AutomationRun["status"], string> = {
  sent: "border-emerald-200 bg-emerald-50 text-emerald-700",
  simulated: "border-blue-200 bg-blue-50 text-blue-700",
  skipped: "border-slate-200 bg-slate-50 text-slate-600",
  failed: "border-rose-200 bg-rose-50 text-rose-700",
};

export default function AdminAutomationCenter() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const enabledCount = useMemo(() => rules.filter((rule) => rule.enabled).length, [rules]);
  const failedCount = useMemo(() => runs.filter((run) => run.status === "failed").length, [runs]);
  const sentCount = useMemo(() => runs.filter((run) => run.status === "sent").length, [runs]);

  async function callFunction(action: string, payload: Record<string, unknown> = {}) {
    const { data, error } = await supabase.functions.invoke("invoice-automation", {
      body: { action, ...payload },
    });
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error || "Automation request failed.");
    return data;
  }

  async function load() {
    setBusy(true);
    try {
      const data = await callFunction("status");
      setRules(data.rules || []);
      setRuns(data.runs || []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Deploy the invoice-automation Edge Function first.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function updateRule(rule: AutomationRule, changes: Partial<AutomationRule>) {
    setBusy(true);
    setNotice(null);
    const { error } = await supabase
      .from("automation_rules")
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq("id", rule.id);
    if (error) setNotice(error.message);
    else {
      setRules((current) => current.map((item) => item.id === rule.id ? { ...item, ...changes } : item));
      setNotice("Automation rule updated.");
    }
    setBusy(false);
  }

  async function run(simulate: boolean) {
    setBusy(true);
    setNotice(null);
    try {
      const result = await callFunction("run", { simulate });
      setNotice(`${simulate ? "Simulation" : "Automation run"} finished: ${result.sent} processed, ${result.skipped} skipped, ${result.failed} failed.`);
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Automation run failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-cyan-950 p-7 text-white shadow-xl">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">Automation engine</p>
        <h1 className="mt-3 text-3xl font-black">Invoice reminders & workflow automation</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Automatically identify due and overdue invoices, email clients through Resend, mark overdue records, and keep a complete execution log.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button disabled={busy} onClick={() => run(true)} className="rounded-2xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-black hover:bg-white/20 disabled:opacity-50">Run safe simulation</button>
          <button disabled={busy} onClick={() => run(false)} className="rounded-2xl bg-white px-4 py-2.5 text-sm font-black text-slate-950 hover:bg-cyan-100 disabled:opacity-50">Run automation now</button>
          <button disabled={busy} onClick={load} className="rounded-2xl border border-white/20 px-4 py-2.5 text-sm font-black hover:bg-white/10 disabled:opacity-50">Refresh</button>
        </div>
      </section>

      {notice && <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">{notice}</div>}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-black uppercase text-slate-400">Enabled rules</p><p className="mt-3 text-3xl font-black text-slate-950">{enabledCount}</p><p className="mt-1 text-sm text-slate-500">of {rules.length} configured</p></div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-black uppercase text-slate-400">Emails sent</p><p className="mt-3 text-3xl font-black text-emerald-600">{sentCount}</p><p className="mt-1 text-sm text-slate-500">recent recorded runs</p></div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-black uppercase text-slate-400">Failures</p><p className="mt-3 text-3xl font-black text-rose-600">{failedCount}</p><p className="mt-1 text-sm text-slate-500">needs attention</p></div>
      </section>

      <section className="space-y-4">
        {rules.map((rule) => {
          const isEditing = editing === rule.id;
          return (
            <article key={rule.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-black text-slate-950">{rule.name}</h2>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${rule.enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-600"}`}>{rule.enabled ? "Active" : "Disabled"}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{rule.description}</p>
                  <p className="mt-2 text-xs font-bold uppercase tracking-wide text-slate-400">{rule.event_type.split("_").join(" ")}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button disabled={busy} onClick={() => updateRule(rule, { enabled: !rule.enabled })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-700 hover:bg-slate-50">{rule.enabled ? "Disable" : "Enable"}</button>
                  <button onClick={() => setEditing(isEditing ? null : rule.id)} className="rounded-xl bg-slate-950 px-3 py-2 text-sm font-black text-white hover:bg-indigo-700">{isEditing ? "Close" : "Edit"}</button>
                </div>
              </div>

              {isEditing && (
                <div className="mt-5 grid gap-4 border-t border-slate-100 pt-5 lg:grid-cols-2">
                  <label className="text-sm font-bold text-slate-700">Days before due date
                    <input type="number" min="0" value={rule.offset_days} disabled={rule.event_type !== "due_reminder"} onChange={(event) => setRules((current) => current.map((item) => item.id === rule.id ? { ...item, offset_days: Number(event.target.value) } : item))} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 disabled:bg-slate-100" />
                  </label>
                  <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700"><input type="checkbox" checked={rule.send_email} onChange={(event) => setRules((current) => current.map((item) => item.id === rule.id ? { ...item, send_email: event.target.checked } : item))} /> Send email through Resend</label>
                  <label className="lg:col-span-2 text-sm font-bold text-slate-700">Email subject
                    <input value={rule.subject_template} onChange={(event) => setRules((current) => current.map((item) => item.id === rule.id ? { ...item, subject_template: event.target.value } : item))} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3" />
                  </label>
                  <label className="lg:col-span-2 text-sm font-bold text-slate-700">Email message
                    <textarea rows={7} value={rule.body_template} onChange={(event) => setRules((current) => current.map((item) => item.id === rule.id ? { ...item, body_template: event.target.value } : item))} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-mono text-sm" />
                  </label>
                  <div className="lg:col-span-2 flex justify-end">
                    <button disabled={busy} onClick={() => updateRule(rule, { offset_days: rule.offset_days, subject_template: rule.subject_template, body_template: rule.body_template, send_email: rule.send_email })} className="rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-black text-white hover:bg-indigo-700 disabled:opacity-50">Save rule</button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5"><h2 className="text-xl font-black text-slate-950">Recent automation runs</h2><p className="text-sm text-slate-500">Latest reminder attempts, simulations, and errors.</p></div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Rule</th><th className="px-5 py-3">Recipient</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Date</th><th className="px-5 py-3">Details</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {runs.length === 0 ? <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-500">No automation runs yet.</td></tr> : runs.map((run) => (
                <tr key={run.id}><td className="px-5 py-4 font-bold text-slate-800">{run.rule_key.split("_").join(" ")}</td><td className="px-5 py-4 text-slate-600">{run.recipient_email || "—"}</td><td className="px-5 py-4"><span className={`rounded-full border px-2.5 py-1 text-xs font-black ${statusStyles[run.status]}`}>{run.status}</span></td><td className="px-5 py-4 text-slate-500">{new Date(run.created_at).toLocaleString()}</td><td className="max-w-xs px-5 py-4 text-xs text-rose-600">{run.error_message || "—"}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        <p className="font-black">Scheduler setup</p>
        <p className="mt-1 leading-6">For automatic daily runs, call the <code>invoice-automation</code> Edge Function once per day with the <code>x-automation-secret</code> header. Manual runs from this page already work after deployment.</p>
      </section>
    </div>
  );
}
