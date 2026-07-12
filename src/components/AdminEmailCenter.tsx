import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type TemplateRow = {
  id: string;
  template_key: string;
  name: string;
  subject: string;
  html_body: string;
  text_body: string | null;
  enabled: boolean;
  updated_at: string;
};

type DeliveryLog = {
  id: string;
  template_key: string | null;
  recipient_email: string;
  subject: string;
  status: "queued" | "sent" | "failed" | "skipped";
  provider_message_id: string | null;
  error_message: string | null;
  created_at: string;
};

type EmailSettings = {
  id: string;
  provider: string;
  from_name: string;
  from_email: string;
  reply_to: string | null;
  email_enabled: boolean;
  welcome_enabled: boolean;
  invoice_enabled: boolean;
  payment_enabled: boolean;
  reminder_enabled: boolean;
  subscription_enabled: boolean;
};

type ProviderHealth = { configured: boolean; provider: string; message: string };

const DEFAULT_SETTINGS: EmailSettings = {
  id: "",
  provider: "resend",
  from_name: "Rivox",
  from_email: "onboarding@resend.dev",
  reply_to: null,
  email_enabled: true,
  welcome_enabled: true,
  invoice_enabled: true,
  payment_enabled: true,
  reminder_enabled: true,
  subscription_enabled: true,
};

function statusClass(status: DeliveryLog["status"]) {
  if (status === "sent") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "failed") return "bg-red-50 text-red-700 border-red-200";
  if (status === "queued") return "bg-blue-50 text-blue-700 border-blue-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

export default function AdminEmailCenter() {
  const [tab, setTab] = useState<"overview" | "templates" | "logs" | "settings">("overview");
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [logs, setLogs] = useState<DeliveryLog[]>([]);
  const [settings, setSettings] = useState<EmailSettings>(DEFAULT_SETTINGS);
  const [health, setHealth] = useState<ProviderHealth>({ configured: false, provider: "resend", message: "Checking..." });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [editing, setEditing] = useState<TemplateRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [templatesResult, logsResult, settingsResult] = await Promise.all([
      supabase.from("email_templates").select("*").order("name"),
      supabase.from("email_delivery_logs").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("email_provider_settings").select("*").limit(1).maybeSingle(),
    ]);

    if (templatesResult.data) setTemplates(templatesResult.data as TemplateRow[]);
    if (logsResult.data) setLogs(logsResult.data as DeliveryLog[]);
    if (settingsResult.data) setSettings(settingsResult.data as EmailSettings);

    const { data } = await supabase.functions.invoke("admin-email", { body: { action: "status" } });
    if (data) setHealth(data as ProviderHealth);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const metrics = useMemo(() => {
    const sent = logs.filter((item) => item.status === "sent").length;
    const failed = logs.filter((item) => item.status === "failed").length;
    const activeTemplates = templates.filter((item) => item.enabled).length;
    return { sent, failed, activeTemplates, total: logs.length };
  }, [logs, templates]);

  async function saveSettings() {
    setSaving(true);
    setNotice("");
    const payload = { ...settings, updated_at: new Date().toISOString() };
    const query = settings.id
      ? supabase.from("email_provider_settings").update(payload).eq("id", settings.id).select().single()
      : supabase.from("email_provider_settings").insert(payload).select().single();
    const { data, error } = await query;
    setSaving(false);
    if (error) return setNotice(error.message);
    setSettings(data as EmailSettings);
    setNotice("Email settings saved.");
  }

  async function saveTemplate() {
    if (!editing) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("email_templates")
      .update({
        name: editing.name,
        subject: editing.subject,
        html_body: editing.html_body,
        text_body: editing.text_body,
        enabled: editing.enabled,
        updated_at: new Date().toISOString(),
      })
      .eq("id", editing.id)
      .select()
      .single();
    setSaving(false);
    if (error) return setNotice(error.message);
    setTemplates((current) => current.map((row) => row.id === editing.id ? data as TemplateRow : row));
    setEditing(null);
    setNotice("Template updated.");
  }

  async function sendTest() {
    if (!testEmail.trim()) return setNotice("Enter a test email address.");
    setSaving(true);
    setNotice("");
    const { data, error } = await supabase.functions.invoke("admin-email", {
      body: { action: "send_test", recipient: testEmail.trim() },
    });
    setSaving(false);
    if (error) return setNotice(error.message);
    setNotice(data?.message || "Test email sent.");
    await load();
  }

  if (loading) return <div className="card p-8 text-sm text-slate-500">Loading Email & Notifications Center...</div>;

  return (
    <section className="space-y-6">
      <div className="rounded-3xl bg-slate-950 text-white p-7 overflow-hidden relative">
        <div className="absolute -right-16 -top-16 w-48 h-48 rounded-full bg-primary-500/20" />
        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-300">Communications</p>
            <h1 className="text-3xl font-black mt-2">Email & Notification Center</h1>
            <p className="text-slate-300 mt-2 max-w-2xl">Manage transactional templates, delivery controls, provider health and email history without changing application code.</p>
          </div>
          <div className={`rounded-2xl border px-5 py-4 ${health.configured ? "bg-emerald-500/10 border-emerald-400/30" : "bg-amber-500/10 border-amber-400/30"}`}>
            <p className="text-xs uppercase tracking-wide text-slate-300">Provider health</p>
            <p className="font-bold mt-1">{health.configured ? "● Connected" : "● Setup required"}</p>
            <p className="text-xs text-slate-300 mt-1">{health.message}</p>
          </div>
        </div>
      </div>

      {notice && <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">{notice}</div>}

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          ["Active templates", metrics.activeTemplates, "✉️"],
          ["Sent (recent)", metrics.sent, "✅"],
          ["Failed (recent)", metrics.failed, "⚠️"],
          ["Delivery records", metrics.total, "📨"],
        ].map(([label, value, icon]) => <div key={String(label)} className="card p-5"><span className="text-xl">{icon}</span><p className="text-xs uppercase tracking-wide text-slate-500 mt-3">{label}</p><p className="text-2xl font-black text-slate-950 mt-1">{value}</p></div>)}
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2">
        {(["overview", "templates", "logs", "settings"] as const).map((item) => (
          <button key={item} onClick={() => setTab(item)} className={`px-4 py-2 rounded-xl text-sm font-semibold capitalize ${tab === item ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{item}</button>
        ))}
      </div>

      {tab === "overview" && <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-6">
        <div className="card p-6">
          <h2 className="text-lg font-bold text-slate-950">Transactional automation</h2>
          <p className="text-sm text-slate-500 mt-1">Enable or pause categories instantly.</p>
          <div className="grid sm:grid-cols-2 gap-3 mt-5">
            {[
              ["welcome_enabled", "Welcome & onboarding"], ["invoice_enabled", "Invoice delivery"], ["payment_enabled", "Payment confirmations"],
              ["reminder_enabled", "Payment reminders"], ["subscription_enabled", "Subscription lifecycle"],
            ].map(([key, label]) => <label key={key} className="flex items-center justify-between rounded-xl border border-slate-200 p-4"><span className="text-sm font-semibold text-slate-800">{label}</span><input type="checkbox" checked={Boolean(settings[key as keyof EmailSettings])} onChange={(e) => setSettings({ ...settings, [key]: e.target.checked })} /></label>)}
          </div>
          <button className="btn-primary mt-5" disabled={saving} onClick={saveSettings}>{saving ? "Saving..." : "Save controls"}</button>
        </div>
        <div className="card p-6">
          <h2 className="text-lg font-bold text-slate-950">Send test email</h2>
          <p className="text-sm text-slate-500 mt-1">Confirms provider, sender and delivery configuration.</p>
          <input className="input mt-5" type="email" placeholder="you@example.com" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} />
          <button className="btn-primary w-full mt-3" disabled={saving} onClick={sendTest}>{saving ? "Sending..." : "Send test"}</button>
          <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 mt-5 text-xs text-slate-600">Provider secrets stay in Supabase Edge Function secrets and are never exposed to the browser.</div>
        </div>
      </div>}

      {tab === "templates" && <div className="card overflow-hidden">
        <div className="p-5 border-b border-slate-100"><h2 className="text-lg font-bold text-slate-950">Email templates</h2><p className="text-sm text-slate-500">Variables use double braces, for example <code>{"{{customer_name}}"}</code>.</p></div>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Template</th><th className="px-5 py-3">Subject</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{templates.map((row) => <tr key={row.id}><td className="px-5 py-4"><p className="font-semibold text-slate-900">{row.name}</p><p className="text-xs text-slate-400">{row.template_key}</p></td><td className="px-5 py-4 text-slate-600">{row.subject}</td><td className="px-5 py-4"><span className={`rounded-full border px-2.5 py-1 text-xs ${row.enabled ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-600 border-slate-200"}`}>{row.enabled ? "Enabled" : "Disabled"}</span></td><td className="px-5 py-4 text-right"><button className="btn-secondary text-xs" onClick={() => setEditing(row)}>Edit</button></td></tr>)}</tbody></table></div>
      </div>}

      {tab === "logs" && <div className="card overflow-hidden"><div className="p-5 border-b border-slate-100"><h2 className="text-lg font-bold text-slate-950">Delivery history</h2></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Recipient</th><th className="px-5 py-3">Subject</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Time</th></tr></thead><tbody className="divide-y divide-slate-100">{logs.map((row) => <tr key={row.id}><td className="px-5 py-4">{row.recipient_email}</td><td className="px-5 py-4"><p className="font-medium text-slate-800">{row.subject}</p>{row.error_message && <p className="text-xs text-red-600 mt-1">{row.error_message}</p>}</td><td className="px-5 py-4"><span className={`rounded-full border px-2.5 py-1 text-xs ${statusClass(row.status)}`}>{row.status}</span></td><td className="px-5 py-4 text-slate-500">{new Date(row.created_at).toLocaleString()}</td></tr>)}</tbody></table>{logs.length === 0 && <div className="p-8 text-center text-sm text-slate-500">No email deliveries recorded yet.</div>}</div></div>}

      {tab === "settings" && <div className="card p-6 max-w-3xl">
        <h2 className="text-lg font-bold text-slate-950">Sender settings</h2>
        <div className="grid md:grid-cols-2 gap-4 mt-5">
          <label className="text-sm font-medium text-slate-700">From name<input className="input mt-2" value={settings.from_name} onChange={(e) => setSettings({ ...settings, from_name: e.target.value })} /></label>
          <label className="text-sm font-medium text-slate-700">From email<input className="input mt-2" type="email" value={settings.from_email} onChange={(e) => setSettings({ ...settings, from_email: e.target.value })} /></label>
          <label className="text-sm font-medium text-slate-700">Reply-to email<input className="input mt-2" type="email" value={settings.reply_to || ""} onChange={(e) => setSettings({ ...settings, reply_to: e.target.value || null })} /></label>
          <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 mt-6"><input type="checkbox" checked={settings.email_enabled} onChange={(e) => setSettings({ ...settings, email_enabled: e.target.checked })} /><span className="text-sm font-semibold text-slate-800">Master email switch</span></label>
        </div>
        <button className="btn-primary mt-5" disabled={saving} onClick={saveSettings}>{saving ? "Saving..." : "Save sender settings"}</button>
      </div>}

      {editing && <div className="fixed inset-0 z-50 bg-slate-950/50 p-4 flex items-center justify-center"><div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[92vh] overflow-y-auto"><div className="p-6 border-b border-slate-100 flex justify-between"><div><h2 className="text-xl font-black text-slate-950">Edit {editing.name}</h2><p className="text-xs text-slate-500 mt-1">{editing.template_key}</p></div><button className="btn-secondary" onClick={() => setEditing(null)}>Close</button></div><div className="p-6 space-y-4"><label className="text-sm font-medium text-slate-700">Template name<input className="input mt-2" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label><label className="text-sm font-medium text-slate-700">Subject<input className="input mt-2" value={editing.subject} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} /></label><label className="text-sm font-medium text-slate-700">HTML body<textarea className="input mt-2 min-h-64 font-mono text-xs" value={editing.html_body} onChange={(e) => setEditing({ ...editing, html_body: e.target.value })} /></label><label className="flex items-center gap-3"><input type="checkbox" checked={editing.enabled} onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })} /><span className="text-sm font-semibold">Enabled</span></label></div><div className="p-6 border-t border-slate-100 flex justify-end gap-2"><button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button><button className="btn-primary" disabled={saving} onClick={saveTemplate}>{saving ? "Saving..." : "Save template"}</button></div></div></div>}
    </section>
  );
}
