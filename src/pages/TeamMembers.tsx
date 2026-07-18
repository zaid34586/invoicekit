import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

type Role = "manager" | "accountant" | "staff";
type MemberStatus = "pending" | "active" | "disabled";
interface Member { id: string; email: string; name: string | null; role: Role; status: MemberStatus; invited_at: string; expires_at: string; }

const roleInfo: Record<Role, { title: string; access: string }> = {
  manager: { title: "Manager", access: "Dashboard, clients, invoices and reports" },
  accountant: { title: "Accountant", access: "Clients, invoices and reports" },
  staff: { title: "Staff", access: "Clients and create/edit invoices" },
};

export default function TeamMembers() {
  const { user, profile } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [form, setForm] = useState({ name: "", email: "", role: "staff" as Role });

  const plan = profile?.plan === "business" ? "business" : profile?.plan === "pro" || profile?.is_pro ? "pro" : "free";
  const seatLimit = plan === "business" ? Infinity : plan === "pro" ? 3 : 0;
  const usedSeats = members.filter((m) => m.status !== "disabled").length;
  const isOwner = !profile?.workspace_owner_id || profile.workspace_owner_id === user?.id || profile.workspace_role === "owner";

  const load = useCallback(async () => {
    if (!user || !isOwner) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.from("workspace_members").select("id,email,name,role,status,invited_at,expires_at").eq("workspace_owner_id", user.id).order("created_at", { ascending: false });
    if (error) setNotice({ type: "error", text: error.message });
    setMembers((data as Member[]) || []);
    setLoading(false);
  }, [user, isOwner]);

  useEffect(() => { void load(); }, [load]);

  async function callTeam(body: Record<string, unknown>) {
    const { data, error } = await supabase.functions.invoke("workspace-team", { body });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  }

  async function invite(e: FormEvent) {
    e.preventDefault(); setNotice(null); setWorking("invite");
    try {
      await callTeam({ action: "invite", ...form, redirectTo: `${window.location.origin}/login?team_invite=1` });
      setForm({ name: "", email: "", role: "staff" });
      setNotice({ type: "ok", text: "Invitation sent successfully." });
      await load();
    } catch (err) { setNotice({ type: "error", text: err instanceof Error ? err.message : "Invitation failed" }); }
    finally { setWorking(null); }
  }

  async function action(member: Member, type: "disable" | "enable" | "remove" | "role", role?: Role) {
    if (type === "remove" && !window.confirm(`Remove ${member.email} from this workspace?`)) return;
    setWorking(member.id); setNotice(null);
    try { await callTeam({ action: type, memberId: member.id, role }); setNotice({ type: "ok", text: "Team member updated." }); await load(); }
    catch (err) { setNotice({ type: "error", text: err instanceof Error ? err.message : "Update failed" }); }
    finally { setWorking(null); }
  }

  const active = useMemo(() => members.filter((m) => m.status !== "pending"), [members]);
  const pending = useMemo(() => members.filter((m) => m.status === "pending"), [members]);

  if (loading) return <div className="card p-8 text-sm text-slate-500">Loading team members...</div>;

  if (!isOwner) return <div className="card p-8"><h1 className="text-2xl font-black">Team Members</h1><p className="mt-2 text-slate-600">Only the workspace owner can manage team members.</p></div>;

  return <div className="space-y-6 pb-10">
    <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-violet-950 to-indigo-900 p-7 text-white shadow-xl">
      <p className="text-xs font-black uppercase tracking-[.2em] text-violet-300">Workspace access</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-black">Team Members</h1><p className="mt-2 max-w-2xl text-sm text-slate-300">Invite your team, assign roles and control access without sharing the owner password.</p></div><div className="rounded-2xl bg-white/10 px-5 py-3"><p className="text-xs text-violet-200">{plan.toUpperCase()} PLAN</p><p className="mt-1 text-lg font-black">{usedSeats} / {seatLimit === Infinity ? "Unlimited" : seatLimit} seats used</p></div></div>
    </section>

    {notice && <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${notice.type === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>{notice.text}</div>}

    <section className="grid gap-6 xl:grid-cols-[.9fr_1.4fr]">
      <form onSubmit={invite} className="card p-6">
        <h2 className="text-xl font-black text-slate-950">Invite a member</h2>
        <p className="mt-1 text-sm text-slate-500">Invitations expire after 7 days. Duplicate active invitations are blocked.</p>
        <div className="mt-5 space-y-4">
          <label className="block text-sm font-bold text-slate-700">Name (optional)<input className="input mt-1.5" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Team member name" /></label>
          <label className="block text-sm font-bold text-slate-700">Email<input required type="email" className="input mt-1.5" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="member@company.com" /></label>
          <label className="block text-sm font-bold text-slate-700">Role<select className="input mt-1.5" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>{Object.entries(roleInfo).map(([key, value]) => <option key={key} value={key}>{value.title}</option>)}</select></label>
          <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><b>{roleInfo[form.role].title}:</b> {roleInfo[form.role].access}</div>
          <button disabled={working === "invite" || usedSeats >= seatLimit} className="w-full rounded-xl bg-violet-600 px-4 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-50">{working === "invite" ? "Sending invitation..." : usedSeats >= seatLimit ? (plan === "free" ? "Upgrade to invite members" : "Seat limit reached") : "Send invitation"}</button>
        </div>
      </form>

      <div className="space-y-6">
        <MemberList title="Active members" empty="No active team members yet." members={active} working={working} onAction={action} />
        <MemberList title="Pending invitations" empty="No pending invitations." members={pending} working={working} onAction={action} pending />
      </div>
    </section>
  </div>;
}

function MemberList({ title, empty, members, working, onAction, pending = false }: { title: string; empty: string; members: Member[]; working: string | null; pending?: boolean; onAction: (m: Member, type: "disable" | "enable" | "remove" | "role", role?: Role) => void }) {
  return <section className="card overflow-hidden"><div className="border-b border-slate-100 px-5 py-4"><h2 className="font-black text-slate-950">{title}</h2></div>{members.length === 0 ? <p className="p-6 text-sm text-slate-500">{empty}</p> : <div className="divide-y divide-slate-100">{members.map((m) => <div key={m.id} className="p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-bold text-slate-900">{m.name || m.email}</p><p className="text-sm text-slate-500">{m.email}</p></div><span className={`rounded-full px-3 py-1 text-xs font-black ${m.status === "active" ? "bg-emerald-100 text-emerald-700" : m.status === "disabled" ? "bg-slate-200 text-slate-600" : "bg-amber-100 text-amber-700"}`}>{m.status}</span></div><div className="mt-4 flex flex-wrap items-center gap-2"><select disabled={pending || working === m.id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={m.role} onChange={(e) => onAction(m, "role", e.target.value as Role)}>{Object.entries(roleInfo).map(([key, value]) => <option key={key} value={key}>{value.title}</option>)}</select>{!pending && <button disabled={working === m.id} onClick={() => onAction(m, m.status === "disabled" ? "enable" : "disable")} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold">{m.status === "disabled" ? "Enable" : "Disable"}</button>}<button disabled={working === m.id} onClick={() => onAction(m, "remove")} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-bold text-red-600">Remove</button></div>{pending && <p className="mt-3 text-xs text-slate-500">Expires {new Date(m.expires_at).toLocaleDateString()}</p>}</div>)}</div>}</section>;
}
