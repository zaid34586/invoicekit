import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type Role = "full_access" | "limited" | "support" | "finance" | "viewer";
type Member = { id: string; name: string | null; email: string; role: Role; status: "active" | "disabled"; created_at: string };
type AuditEvent = { id: string; action: string; target_type: string | null; target_id: string | null; details: Record<string, unknown> | null; created_at: string };

const roleInfo: Record<Role, { label: string; risk: string; access: string[] }> = {
  full_access: { label: "Full access", risk: "High", access: ["Operations", "Users", "Finance", "Support", "Team"] },
  limited: { label: "Limited operations", risk: "Medium", access: ["Dashboard", "Users", "Tasks"] },
  support: { label: "Support", risk: "Medium", access: ["Support", "Users", "Tasks"] },
  finance: { label: "Finance", risk: "High", access: ["Revenue", "Invoices", "Reports"] },
  viewer: { label: "Viewer", risk: "Low", access: ["Dashboard", "Users", "Reports"] },
};

export default function AdminAccessGovernance() {
  const [members, setMembers] = useState<Member[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "sensitive" | "access">("all");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [team, audit] = await Promise.all([
      supabase.from("admin_team_members").select("id,name,email,role,status,created_at").order("created_at"),
      supabase.from("admin_audit_logs").select("id,action,target_type,target_id,details,created_at").order("created_at", { ascending: false }).limit(100),
    ]);
    if (team.error || audit.error) { setNotice(team.error?.message || audit.error?.message || "Unable to load access governance data."); return; }
    setMembers((team.data || []) as Member[]);
    setEvents((audit.data || []) as AuditEvent[]);
    setNotice("");
  }, []);

  useEffect(() => { void load(); }, [load]);

  const updateMember = async (member: Member, patch: Partial<Pick<Member, "role" | "status">>) => {
    const label = patch.role ? `Change ${member.email} to ${roleInfo[patch.role].label}?` : `Change ${member.email} to ${patch.status}?`;
    if (!window.confirm(label)) return;
    setBusyId(member.id); setNotice("");
    const { error } = await supabase.from("admin_team_members").update(patch).eq("id", member.id);
    if (error) setNotice(error.message); else { setNotice("Access change saved and recorded in the audit trail."); await load(); }
    setBusyId(null);
  };

  const recordReview = async () => {
    setNotice("");
    const { error } = await supabase.from("admin_audit_logs").insert({ action: "access_review_completed", target_type: "access_governance", details: { members_reviewed: members.length, reviewed_at: new Date().toISOString() } });
    if (error) setNotice(error.message); else { setNotice("Access review recorded in the audit trail."); await load(); }
  };

  const visibleEvents = useMemo(() => events.filter((event) => {
    const content = `${event.action} ${event.target_type || ""} ${event.target_id || ""} ${JSON.stringify(event.details || {})}`.toLowerCase();
    const isAccess = event.action.includes("access") || event.action.includes("team_member") || event.target_type === "admin_team_member";
    const isSensitive = isAccess || ["user_banned", "user_unbanned", "subscription_updated", "system_settings_updated"].includes(event.action);
    return (!search.trim() || content.includes(search.trim().toLowerCase())) && (filter === "all" || (filter === "access" ? isAccess : isSensitive));
  }), [events, filter, search]);
  const activeMembers = members.filter((member) => member.status === "active");
  const privilegedMembers = activeMembers.filter((member) => member.role === "full_access" || member.role === "finance");

  return (
    <section className="space-y-6">
      <div className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-950 p-6 text-white shadow-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div><p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-300">Part 10 - security operations</p><h1 className="mt-2 text-3xl font-black">Access Governance & Audit Trail</h1><p className="mt-2 text-sm text-slate-300">Review staff access, remove unnecessary permissions and retain a traceable record of sensitive admin changes.</p></div>
          <button className="rounded-xl bg-white px-4 py-2.5 text-sm font-black text-slate-950" onClick={() => void recordReview()}>Record access review</button>
        </div>
      </div>
      {notice && <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">{notice}</div>}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[["Active staff", activeMembers.length], ["Privileged access", privilegedMembers.length], ["Disabled accounts", members.filter((member) => member.status === "disabled").length], ["Recent audit events", events.length]].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-2 text-3xl font-black text-slate-950">{value}</p></div>)}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5"><h2 className="text-lg font-black text-slate-950">Staff access register</h2><p className="mt-1 text-sm text-slate-500">Full-access and finance roles should be assigned only to people who need them.</p></div>
        <div className="divide-y divide-slate-100">
          {members.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No staff accounts found.</p> : members.map((member) => (
            <div key={member.id} className="flex flex-col gap-4 p-5 xl:flex-row xl:items-center xl:justify-between">
              <div><div className="flex flex-wrap items-center gap-2"><p className="font-black text-slate-950">{member.name || member.email}</p><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${member.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{member.status}</span><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${roleInfo[member.role].risk === "High" ? "bg-rose-100 text-rose-700" : roleInfo[member.role].risk === "Medium" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{roleInfo[member.role].risk} risk</span></div><p className="mt-1 text-sm text-slate-500">{member.email}</p><p className="mt-2 text-xs text-slate-500">Access: {roleInfo[member.role].access.join(" / ")}</p></div>
              <div className="grid grid-cols-2 gap-2 sm:flex"><select className="input min-w-40" value={member.role} disabled={busyId === member.id} onChange={(event) => void updateMember(member, { role: event.target.value as Role })}>{(Object.keys(roleInfo) as Role[]).map((role) => <option key={role} value={role}>{roleInfo[role].label}</option>)}</select><button className={`rounded-xl px-3 py-2 text-sm font-bold ${member.status === "active" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`} disabled={busyId === member.id} onClick={() => void updateMember(member, { status: member.status === "active" ? "disabled" : "active" })}>{busyId === member.id ? "Saving..." : member.status === "active" ? "Disable" : "Enable"}</button></div>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-5 lg:flex-row"><div className="flex-1"><h2 className="text-lg font-black text-slate-950">Sensitive activity</h2><p className="mt-1 text-sm text-slate-500">Access updates are recorded by the database, not only by the browser.</p></div><input className="input lg:w-80" placeholder="Search audit activity..." value={search} onChange={(event) => setSearch(event.target.value)} /><select className="input lg:w-48" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option value="all">All events</option><option value="sensitive">Sensitive only</option><option value="access">Access changes</option></select></div>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase text-slate-500"><th className="px-5 py-3">Time</th><th className="px-5 py-3">Action</th><th className="px-5 py-3">Target</th><th className="px-5 py-3">Details</th></tr></thead><tbody className="divide-y divide-slate-100">{visibleEvents.length === 0 ? <tr><td colSpan={4} className="p-8 text-center text-slate-500">No matching audit activity.</td></tr> : visibleEvents.slice(0, 50).map((event) => <tr key={event.id}><td className="whitespace-nowrap px-5 py-3 text-slate-500">{new Date(event.created_at).toLocaleString()}</td><td className="px-5 py-3 font-bold text-slate-900">{event.action.replaceAll("_", " ")}</td><td className="px-5 py-3 text-slate-600">{event.target_type || "-"}</td><td className="max-w-md truncate px-5 py-3 text-xs text-slate-500">{JSON.stringify(event.details || {})}</td></tr>)}</tbody></table></div>
      </div>
    </section>
  );
}
