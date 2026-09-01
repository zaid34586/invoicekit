import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

type SessionRow = {
  id: string; user_id: string; email: string | null; portal: string;
  device_label: string | null; user_agent: string | null; last_seen_at: string;
  status: "active" | "revoked" | "expired"; force_logout: boolean;
  revoked_at: string | null; revoke_reason: string | null;
};
type EventRow = {
  id: string; event_type: string; actor_email: string | null; portal: string;
  device_label: string | null; status: string; severity: string; details: Record<string, unknown>;
  created_at: string;
};

export default function AdminSecurityCenter() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const [{ data: sessionRows, error: sessionError }, { data: eventRows, error: eventError }] = await Promise.all([
      supabase.from("admin_active_sessions").select("*").order("last_seen_at", { ascending: false }).limit(200),
      supabase.from("admin_security_events").select("*").order("created_at", { ascending: false }).limit(200),
    ]);
    if (sessionError || eventError) setMessage(sessionError?.message || eventError?.message || "Unable to load security data.");
    else { setSessions((sessionRows || []) as SessionRow[]); setEvents((eventRows || []) as EventRow[]); }
  }, []);

  useEffect(() => {
    void load();
    const channel = supabase.channel("admin-security-center")
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_active_sessions" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_security_events" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const revoke = async (session: SessionRow) => {
    if (!window.confirm(`Force logout ${session.email || "this session"}?`)) return;
    const now = new Date().toISOString();
    const { error } = await supabase.from("admin_active_sessions").update({
      force_logout: true, status: "revoked", revoked_at: now, revoke_reason: "Revoked by Rivox Owner",
    }).eq("id", session.id);
    if (error) setMessage(error.message);
    else {
      await supabase.from("admin_security_events").insert({
        event_type: "force_logout", actor_user_id: session.user_id, actor_email: session.email,
        portal: "admin", status: "warning", severity: "warning",
        device_label: session.device_label, details: { session_id: session.id, initiated_by: "owner" },
      });
      setMessage("Session revoked. The device will be signed out on its next security heartbeat.");
      await load();
    }
  };

  const active = sessions.filter((s) => s.status === "active" && !s.force_logout);
  const recent = active.filter((s) => Date.now() - new Date(s.last_seen_at).getTime() < 5 * 60 * 1000);
  const warnings = events.filter((e) => e.severity === "warning" || e.severity === "critical");
  const visible = useMemo(() => sessions.filter((s) => !search.trim() || `${s.email} ${s.device_label} ${s.portal}`.toLowerCase().includes(search.toLowerCase())), [search, sessions]);

  return (
    <section className="space-y-6">
      <div className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-950 p-6 text-white shadow-xl">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-300">Identity protection</p>
        <h1 className="mt-2 text-3xl font-black">Security & Risk Command Center</h1>
        <p className="mt-2 text-sm text-slate-300">Live devices, session heartbeat, access events and immediate remote logout.</p>
      </div>
      {message && <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">{message}</div>}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[["Active sessions", active.length, "🟢"], ["Online now", recent.length, "💻"], ["Risk events", warnings.length, "⚠️"], ["Revoked", sessions.filter((s) => s.status === "revoked").length, "🔒"]].map(([label, value, icon]) => (
          <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-2xl">{icon}</p><p className="mt-3 text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-1 text-3xl font-black text-slate-950">{value}</p></div>
        ))}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-5 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="text-lg font-black text-slate-950">Device sessions</h2><p className="text-sm text-slate-500">Heartbeat updates every 60 seconds.</p></div><input className="input lg:w-80" placeholder="Search email, device or portal..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        {visible.length === 0 ? <p className="p-10 text-center text-sm text-slate-500">Sessions will appear after users sign in on the updated deployment.</p> : <div className="divide-y divide-slate-100">{visible.map((session) => (
          <div key={session.id} className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div><div className="flex flex-wrap items-center gap-2"><p className="font-bold text-slate-950">{session.email || session.user_id}</p><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${session.status === "active" && !session.force_logout ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{session.force_logout ? "revoked" : session.status}</span><span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">{session.portal}</span></div><p className="mt-1 text-sm text-slate-600">{session.device_label || "Unknown device"}</p><p className="mt-1 text-xs text-slate-500">Last seen {new Date(session.last_seen_at).toLocaleString()}</p></div>
            {session.status === "active" && !session.force_logout && session.user_id !== user?.id
              ? <button onClick={() => void revoke(session)} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white">Force logout</button>
              : session.user_id === user?.id ? <span className="text-xs font-bold text-emerald-600">Current owner session</span> : null}
          </div>
        ))}</div>}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-5"><h2 className="text-lg font-black text-slate-950">Recent security events</h2></div><div className="divide-y divide-slate-100">{events.slice(0, 20).length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No security events yet.</p> : events.slice(0, 20).map((event) => <div key={event.id} className="flex items-center justify-between gap-4 p-4"><div><p className="font-bold text-slate-900">{event.event_type.replaceAll("_", " ")}</p><p className="text-sm text-slate-500">{event.actor_email || event.portal} · {event.device_label || "Unknown device"}</p></div><p className="text-xs text-slate-500">{new Date(event.created_at).toLocaleString()}</p></div>)}</div></div>
    </section>
  );
}
