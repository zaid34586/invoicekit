import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

const OWNER_EMAIL = "mz7123272@gmail.com";

type WorkspaceSettings = {
  id: string;
  workspace_name: string;
  support_email: string;
  default_currency: string;
  timezone: string;
  language: string;
  date_format: string;
  require_strong_passwords: boolean;
  session_timeout_minutes: number;
  notify_on_new_login: boolean;
  notify_on_role_change: boolean;
  notify_on_security_event: boolean;
  updated_at: string;
};

type TeamRow = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  status: string;
  created_at: string;
};

type AuditRow = {
  id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

const DEFAULT_SETTINGS: Omit<WorkspaceSettings, "id" | "updated_at"> = {
  workspace_name: "Rivox",
  support_email: "support@rivoxcloud.com",
  default_currency: "USD",
  timezone: "Asia/Kolkata",
  language: "English",
  date_format: "DD/MM/YYYY",
  require_strong_passwords: true,
  session_timeout_minutes: 60,
  notify_on_new_login: true,
  notify_on_role_change: true,
  notify_on_security_event: true,
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function statusTone(value: string) {
  if (value === "active") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (value === "disabled") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-black text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

export default function AdminWorkspaceSettings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [team, setTeam] = useState<TeamRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    const [settingsRes, teamRes, auditRes] = await Promise.all([
      supabase.from("admin_workspace_settings").select("*").limit(1).maybeSingle(),
      supabase.from("admin_team_members").select("id,name,email,role,status,created_at").order("created_at", { ascending: false }),
      supabase.from("admin_audit_logs").select("id,action,target_type,target_id,details,created_at").order("created_at", { ascending: false }).limit(12),
    ]);

    if (settingsRes.error && settingsRes.error.code !== "PGRST116") {
      setError(settingsRes.error.message);
    }
    if (settingsRes.data) {
      const row = settingsRes.data as WorkspaceSettings;
      setRecordId(row.id);
      setSettings({
        workspace_name: row.workspace_name,
        support_email: row.support_email,
        default_currency: row.default_currency,
        timezone: row.timezone,
        language: row.language,
        date_format: row.date_format,
        require_strong_passwords: row.require_strong_passwords,
        session_timeout_minutes: row.session_timeout_minutes,
        notify_on_new_login: row.notify_on_new_login,
        notify_on_role_change: row.notify_on_role_change,
        notify_on_security_event: row.notify_on_security_event,
      });
    }
    if (teamRes.error) setError(teamRes.error.message);
    if (auditRes.error) setError(auditRes.error.message);
    setTeam((teamRes.data as TeamRow[]) ?? []);
    setAudit((auditRes.data as AuditRow[]) ?? []);
    setLoading(false);
  }

  async function save() {
    setSaving(true);
    setNotice(null);
    setError(null);
    const payload = { ...settings, updated_at: new Date().toISOString() };
    const request = recordId
      ? supabase.from("admin_workspace_settings").update(payload).eq("id", recordId).select("id").single()
      : supabase.from("admin_workspace_settings").insert(payload).select("id").single();
    const { data, error: saveError } = await request;
    if (saveError) {
      setError(saveError.message);
      setSaving(false);
      return;
    }
    if (data?.id) setRecordId(data.id);
    await supabase.from("admin_audit_logs").insert({
      action: "workspace_settings_updated",
      target_type: "workspace",
      target_id: data?.id ?? recordId,
      details: { workspace_name: settings.workspace_name, support_email: settings.support_email },
    });
    setNotice("Workspace and security settings saved.");
    setSaving(false);
    await load();
  }

  const stats = useMemo(() => {
    const active = team.filter((member) => member.status === "active").length;
    const disabled = team.filter((member) => member.status === "disabled").length;
    const fullAccess = team.filter((member) => member.role === "full_access").length;
    return { active, disabled, fullAccess };
  }, [team]);

  if (loading) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Loading workspace controls...</div>;
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-600">Owner control center</p>
          <h1 className="mt-1 text-2xl font-black text-slate-900">Workspace & Security</h1>
          <p className="mt-1 text-sm text-slate-500">Manage Rivox identity, team access, security rules and recent administrative activity.</p>
        </div>
        <button className="btn-primary" disabled={saving} onClick={save}>{saving ? "Saving..." : "Save Settings"}</button>
      </div>

      {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{notice}</div>}
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Owner" value={OWNER_EMAIL} hint="Primary workspace administrator" />
        <StatCard label="Active team" value={String(stats.active)} hint={`${stats.disabled} disabled accounts`} />
        <StatCard label="Full access" value={String(stats.fullAccess)} hint="Members with owner-level access" />
        <StatCard label="Recent activity" value={String(audit.length)} hint="Latest administrative events" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">Workspace Profile</h2>
            <p className="mt-1 text-sm text-slate-500">These defaults are used across admin tools and future workspace automation.</p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700">Workspace name
                <input className="input mt-1.5" value={settings.workspace_name} onChange={(e) => setSettings({ ...settings, workspace_name: e.target.value })} />
              </label>
              <label className="text-sm font-semibold text-slate-700">Support email
                <input className="input mt-1.5" type="email" value={settings.support_email} onChange={(e) => setSettings({ ...settings, support_email: e.target.value })} />
              </label>
              <label className="text-sm font-semibold text-slate-700">Default currency
                <select className="input mt-1.5" value={settings.default_currency} onChange={(e) => setSettings({ ...settings, default_currency: e.target.value })}>
                  <option>USD</option><option>INR</option><option>EUR</option><option>GBP</option><option>AUD</option><option>CAD</option>
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-700">Timezone
                <select className="input mt-1.5" value={settings.timezone} onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}>
                  <option value="Asia/Kolkata">Asia/Kolkata</option><option value="UTC">UTC</option><option value="America/New_York">America/New_York</option><option value="Europe/London">Europe/London</option>
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-700">Language
                <select className="input mt-1.5" value={settings.language} onChange={(e) => setSettings({ ...settings, language: e.target.value })}>
                  <option>English</option><option>Hindi</option>
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-700">Date format
                <select className="input mt-1.5" value={settings.date_format} onChange={(e) => setSettings({ ...settings, date_format: e.target.value })}>
                  <option>DD/MM/YYYY</option><option>MM/DD/YYYY</option><option>YYYY-MM-DD</option>
                </select>
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">Security Policy</h2>
            <p className="mt-1 text-sm text-slate-500">Central security defaults for administrative and staff access.</p>
            <div className="mt-5 space-y-4">
              <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-4">
                <span><span className="block font-semibold text-slate-800">Strong passwords</span><span className="text-xs text-slate-500">Require stronger passwords for new staff accounts.</span></span>
                <input type="checkbox" checked={settings.require_strong_passwords} onChange={(e) => setSettings({ ...settings, require_strong_passwords: e.target.checked })} />
              </label>
              <label className="block rounded-xl border border-slate-200 p-4 text-sm font-semibold text-slate-700">Session timeout
                <select className="input mt-2" value={settings.session_timeout_minutes} onChange={(e) => setSettings({ ...settings, session_timeout_minutes: Number(e.target.value) })}>
                  <option value={30}>30 minutes</option><option value={60}>1 hour</option><option value={240}>4 hours</option><option value={480}>8 hours</option><option value={1440}>24 hours</option>
                </select>
              </label>
              {[
                ["notify_on_new_login", "New login alerts", "Notify the owner when a new admin or staff login is detected."],
                ["notify_on_role_change", "Role change alerts", "Notify the owner whenever team permissions are changed."],
                ["notify_on_security_event", "Security event alerts", "Notify the owner about failed checks and sensitive changes."],
              ].map(([key, title, description]) => (
                <label key={key} className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-4">
                  <span><span className="block font-semibold text-slate-800">{title}</span><span className="text-xs text-slate-500">{description}</span></span>
                  <input type="checkbox" checked={Boolean(settings[key as keyof typeof settings])} onChange={(e) => setSettings({ ...settings, [key]: e.target.checked })} />
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div><h2 className="text-lg font-bold text-slate-900">Team Access</h2><p className="text-sm text-slate-500">Current staff roles and access state.</p></div>
              <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">{team.length} members</span>
            </div>
            <div className="mt-5 space-y-3">
              {team.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No staff members yet.</p> : team.slice(0, 8).map((member) => (
                <div key={member.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                  <div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{member.name || member.email}</p><p className="truncate text-xs text-slate-500">{member.email} • {member.role.split("_").join(" ")}</p></div>
                  <span className={cx("rounded-full border px-2.5 py-1 text-xs font-bold", statusTone(member.status))}>{member.status}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">Recent Security Activity</h2>
            <p className="mt-1 text-sm text-slate-500">Latest actions recorded by the admin audit system.</p>
            <div className="mt-5 space-y-3">
              {audit.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No activity recorded yet.</p> : audit.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-3"><p className="text-sm font-bold text-slate-900">{item.action.split("_").join(" ")}</p><span className="whitespace-nowrap text-[11px] text-slate-400">{new Date(item.created_at).toLocaleString()}</span></div>
                  <p className="mt-1 text-xs text-slate-500">{item.target_type || "system"}{item.target_id ? ` • ${item.target_id}` : ""}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
