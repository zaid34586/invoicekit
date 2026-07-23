import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type Member = {
  id: string; name: string | null; email: string; role: string; status: string;
  availability: "available" | "busy" | "offline" | "on_leave";
  on_call: boolean; skills: string[]; max_active_cases: number;
};
type Work = { assigned_to: string | null; status: string };

export default function AdminTeamWorkload() {
  const [members, setMembers] = useState<Member[]>([]);
  const [work, setWork] = useState<Record<string, number>>({});
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const [team, tasks, support, billing, system] = await Promise.all([
      supabase.from("admin_team_members").select("id,name,email,role,status,availability,on_call,skills,max_active_cases").order("created_at"),
      supabase.from("admin_tasks").select("assigned_to,status").in("status", ["pending", "in_progress", "blocked"]),
      supabase.from("admin_support_tickets").select("assigned_to,status").not("status", "in", '("resolved","closed")'),
      supabase.from("billing_activation_incidents").select("assigned_to,status").in("status", ["detecting", "verifying", "manual_review"]),
      supabase.from("admin_system_incidents").select("assigned_to,status").in("status", ["open", "acknowledged", "investigating"]),
    ]);
    if (team.error) { setMessage(team.error.message); return; }
    setMembers((team.data || []) as Member[]);
    const counts: Record<string, number> = {};
    for (const row of [...(tasks.data || []), ...(support.data || []), ...(billing.data || []), ...(system.data || [])] as Work[]) {
      if (row.assigned_to) counts[row.assigned_to] = (counts[row.assigned_to] || 0) + 1;
    }
    setWork(counts);
  }, []);

  useEffect(() => {
    void load();
    const channel = supabase.channel("admin-team-workload")
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_team_members" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_tasks" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_support_tickets" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const update = async (id: string, patch: Partial<Member>) => {
    setMessage("");
    const { error } = await supabase.from("admin_team_members").update({ ...patch, availability_updated_at: new Date().toISOString() }).eq("id", id);
    if (error) setMessage(error.message); else await load();
  };
  const active = members.filter((m) => m.status === "active");
  const stats = useMemo(() => ({
    available: active.filter((m) => m.availability === "available").length,
    onCall: active.filter((m) => m.on_call).length,
    assigned: Object.values(work).reduce((a, b) => a + b, 0),
    overloaded: active.filter((m) => (work[m.id] || 0) >= m.max_active_cases).length,
  }), [active, work]);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-gradient-to-br from-slate-950 via-emerald-950 to-teal-950 p-6 text-white shadow-xl"><p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">People operations</p><h1 className="mt-2 text-3xl font-black">Team Workload & On-Call Command</h1><p className="mt-2 text-sm text-slate-300">Availability-aware assignment across support, payments, system incidents and internal tasks.</p></div>
      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div>}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">{[["Available", stats.available, "🟢"], ["On call", stats.onCall, "📟"], ["Active cases", stats.assigned, "📋"], ["Overloaded", stats.overloaded, "🚨"]].map(([label, value, icon]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-2xl">{icon}</p><p className="mt-3 text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-1 text-3xl font-black text-slate-950">{value}</p></div>)}</div>
      <div className="grid gap-4 xl:grid-cols-2">
        {members.map((member) => {
          const cases = work[member.id] || 0;
          const percentage = Math.min(100, Math.round((cases / member.max_active_cases) * 100));
          return <div key={member.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3"><div><p className="font-black text-slate-950">{member.name || member.email}</p><p className="text-sm text-slate-500">{member.email} · {member.role.replace("_", " ")}</p></div><label className="flex items-center gap-2 text-xs font-bold text-slate-600"><input type="checkbox" checked={member.on_call} onChange={(e) => void update(member.id, { on_call: e.target.checked })} /> On call</label></div>
            <div className="mt-4 grid grid-cols-[1fr_110px] gap-3"><select className="input" value={member.availability} onChange={(e) => void update(member.id, { availability: e.target.value as Member["availability"] })}><option value="available">Available</option><option value="busy">Busy</option><option value="offline">Offline</option><option value="on_leave">On leave</option></select><input className="input" type="number" min={1} max={100} value={member.max_active_cases} onChange={(e) => void update(member.id, { max_active_cases: Number(e.target.value) || 1 })} title="Maximum active cases" /></div>
            <div className="mt-4"><div className="flex justify-between text-xs font-bold text-slate-500"><span>Workload</span><span>{cases}/{member.max_active_cases}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${percentage >= 100 ? "bg-red-500" : percentage >= 70 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${percentage}%` }} /></div></div>
            <input className="input mt-4" placeholder="Skills: support, billing, security" value={(member.skills || []).join(", ")} onChange={(e) => void update(member.id, { skills: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) })} />
          </div>;
        })}
      </div>
    </div>
  );
}
