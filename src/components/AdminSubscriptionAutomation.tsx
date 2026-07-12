import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type RuleType = "renewal_reminder" | "trial_ending" | "payment_failed" | "subscription_cancelled";

type AutomationRule = {
  id: string;
  rule_type: RuleType;
  enabled: boolean;
  days_before: number;
  subject_template: string;
  body_template: string;
  updated_at: string;
};

type AutomationRun = {
  id: string;
  run_type: string;
  status: "running" | "completed" | "failed" | "simulated";
  processed_count: number;
  sent_count: number;
  failed_count: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
};

type SubscriptionSummary = {
  active: number;
  pastDue: number;
  cancelled: number;
  renewSoon: number;
};

const labels: Record<RuleType, { title: string; description: string; icon: string }> = {
  renewal_reminder: {
    title: "Renewal reminder",
    description: "Email customers before their next recurring charge.",
    icon: "🔁",
  },
  trial_ending: {
    title: "Trial ending reminder",
    description: "Warn trial users before their trial expires.",
    icon: "⏳",
  },
  payment_failed: {
    title: "Payment failed alert",
    description: "Notify customers immediately after Paddle reports a failed payment.",
    icon: "⚠️",
  },
  subscription_cancelled: {
    title: "Cancellation confirmation",
    description: "Confirm cancellation and explain access end date.",
    icon: "🛑",
  },
};

function dateTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export default function AdminSubscriptionAutomation() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [summary, setSummary] = useState<SubscriptionSummary>({ active: 0, pastDue: 0, cancelled: 0, renewSoon: 0 });
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [running, setRunning] = useState<"simulate" | "run" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const now = new Date();
    const sevenDays = new Date(now.getTime() + 7 * 86400000).toISOString();

    const [rulesResult, runsResult, subscriptionsResult] = await Promise.all([
      supabase.from("subscription_automation_rules").select("*").order("rule_type"),
      supabase.from("subscription_automation_runs").select("*").order("created_at", { ascending: false }).limit(12),
      supabase.from("subscriptions").select("status, cancelled, renews_at"),
    ]);

    if (rulesResult.data) setRules(rulesResult.data as AutomationRule[]);
    if (runsResult.data) setRuns(runsResult.data as AutomationRun[]);

    const subscriptions = subscriptionsResult.data ?? [];
    setSummary({
      active: subscriptions.filter((item) => item.status === "active" && !item.cancelled).length,
      pastDue: subscriptions.filter((item) => ["past_due", "paused"].includes(String(item.status))).length,
      cancelled: subscriptions.filter((item) => item.cancelled || item.status === "canceled" || item.status === "cancelled").length,
      renewSoon: subscriptions.filter((item) => item.renews_at && item.renews_at >= now.toISOString() && item.renews_at <= sevenDays).length,
    });
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const enabledCount = useMemo(() => rules.filter((rule) => rule.enabled).length, [rules]);

  function updateRule(id: string, patch: Partial<AutomationRule>) {
    setRules((current) => current.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)));
  }

  async function saveRule(rule: AutomationRule) {
    setSavingId(rule.id);
    setMessage(null);
    const { error } = await supabase
      .from("subscription_automation_rules")
      .update({
        enabled: rule.enabled,
        days_before: Math.max(0, Number(rule.days_before) || 0),
        subject_template: rule.subject_template,
        body_template: rule.body_template,
        updated_at: new Date().toISOString(),
      })
      .eq("id", rule.id);

    setSavingId(null);
    setMessage(error ? error.message : `${labels[rule.rule_type].title} saved.`);
    if (!error) await load();
  }

  async function runAutomation(mode: "simulate" | "run") {
    setRunning(mode);
    setMessage(null);
    const { data, error } = await supabase.functions.invoke("subscription-automation", {
      body: { action: mode },
    });
    setRunning(null);
    setMessage(error ? error.message : `${mode === "simulate" ? "Simulation" : "Automation"} completed: ${data?.sent ?? 0} sent, ${data?.processed ?? 0} processed.`);
    await load();
  }

  if (loading) {
    return <div className="card p-8 text-sm text-slate-500">Loading subscription automation…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">Billing Operations</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Subscription Automation</h1>
          <p className="mt-1 text-sm text-slate-500">Renewals, failed payments and cancellation communication controlled from one place.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" disabled={running !== null} onClick={() => void runAutomation("simulate")}>
            {running === "simulate" ? "Simulating…" : "Run safe simulation"}
          </button>
          <button className="btn-primary" disabled={running !== null} onClick={() => void runAutomation("run")}>
            {running === "run" ? "Running…" : "Run automation now"}
          </button>
        </div>
      </div>

      {message && <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">{message}</div>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Active subscriptions", summary.active, "🟢"],
          ["Renewing in 7 days", summary.renewSoon, "📅"],
          ["Past due", summary.pastDue, "⚠️"],
          ["Cancelled", summary.cancelled, "⛔"],
          ["Enabled rules", `${enabledCount}/${rules.length}`, "⚙️"],
        ].map(([label, value, icon]) => (
          <div key={String(label)} className="card p-5">
            <div className="text-xl">{icon}</div>
            <div className="mt-3 text-2xl font-bold text-slate-900">{value}</div>
            <div className="mt-1 text-xs font-medium text-slate-500">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {rules.map((rule) => {
          const meta = labels[rule.rule_type];
          const usesDays = rule.rule_type === "renewal_reminder" || rule.rule_type === "trial_ending";
          return (
            <div key={rule.id} className="card overflow-hidden">
              <div className="flex items-start justify-between border-b border-slate-100 p-5">
                <div className="flex gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-xl">{meta.icon}</div>
                  <div>
                    <h2 className="font-semibold text-slate-900">{meta.title}</h2>
                    <p className="mt-1 text-sm text-slate-500">{meta.description}</p>
                  </div>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
                  <input type="checkbox" checked={rule.enabled} onChange={(event) => updateRule(rule.id, { enabled: event.target.checked })} />
                  {rule.enabled ? "Enabled" : "Disabled"}
                </label>
              </div>
              <div className="space-y-4 p-5">
                {usesDays && (
                  <label className="block text-sm font-medium text-slate-700">
                    Send before event (days)
                    <input className="input mt-2" type="number" min={0} max={60} value={rule.days_before} onChange={(event) => updateRule(rule.id, { days_before: Number(event.target.value) })} />
                  </label>
                )}
                <label className="block text-sm font-medium text-slate-700">
                  Email subject
                  <input className="input mt-2" value={rule.subject_template} onChange={(event) => updateRule(rule.id, { subject_template: event.target.value })} />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Email message
                  <textarea className="input mt-2 min-h-28 resize-y" value={rule.body_template} onChange={(event) => updateRule(rule.id, { body_template: event.target.value })} />
                </label>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-slate-400">Variables: {"{{name}} {{plan}} {{date}} {{amount}}"}</p>
                  <button className="btn-primary" disabled={savingId === rule.id} onClick={() => void saveRule(rule)}>
                    {savingId === rule.id ? "Saving…" : "Save rule"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-900">Recent automation runs</h2>
          <p className="mt-1 text-sm text-slate-500">Simulation and production history for operational review.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Run</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Processed</th><th className="px-5 py-3">Sent</th><th className="px-5 py-3">Failed</th><th className="px-5 py-3">Started</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {runs.length === 0 ? (
                <tr><td className="px-5 py-8 text-center text-slate-500" colSpan={6}>No automation run yet.</td></tr>
              ) : runs.map((run) => (
                <tr key={run.id}>
                  <td className="px-5 py-4 font-medium text-slate-800">{run.run_type}</td>
                  <td className="px-5 py-4"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">{run.status}</span></td>
                  <td className="px-5 py-4">{run.processed_count}</td><td className="px-5 py-4 text-green-700">{run.sent_count}</td><td className="px-5 py-4 text-red-600">{run.failed_count}</td><td className="px-5 py-4 text-slate-500">{dateTime(run.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
