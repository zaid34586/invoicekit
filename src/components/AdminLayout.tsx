import { type ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { playNotificationSound, unlockAudio } from "../lib/notifySound";
import RivoxLogo from "./RivoxLogo";

type AdminNotification = { id: string; title: string; body: string | null; type: string; read_at: string | null; created_at: string; metadata?: { channel_id?: string; ticket_id?: string; task_id?: string } | null };

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  async function handleSignOut() {
    await signOut();
    navigate("/admin/login", { replace: true });
  }

  async function loadNotifications() {
    const { data } = await supabase.from("notifications").select("id,title,body,type,read_at,created_at,metadata").eq("audience", "admin").is("read_at", null).order("created_at", { ascending: false }).limit(30);
    setNotifications((data as AdminNotification[]) ?? []);
  }

  async function markRead(id: string) {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    setNotifications((current) => current.filter((n) => n.id !== id));
  }

  useEffect(() => {
    // The Admin panel previously had NO notification system at all -- the
    // owner never got a sound or alert for anything (SLA breaches, staff
    // messages, etc). This mirrors the exact same bell+sound setup already
    // used in the staff portal.
    void loadNotifications();
    const onFirstGesture = () => { unlockAudio(); window.removeEventListener("pointerdown", onFirstGesture); };
    window.addEventListener("pointerdown", onFirstGesture, { once: true });

    const channel = supabase
      .channel("admin-notifications")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: "audience=eq.admin" }, () => {
        playNotificationSound();
        void loadNotifications();
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); window.removeEventListener("pointerdown", onFirstGesture); };
  }, []);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#e0f2fe_0,transparent_28%),radial-gradient(circle_at_top_right,#ede9fe_0,transparent_26%),#f8fafc]">
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl shadow-sm">
        <div className="w-full flex items-center justify-between h-16 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="relative">
              <RivoxLogo showWordmark iconClassName="w-10 h-10" wordmarkClassName="text-lg text-slate-950" />
              <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
            </div>
            <div>
              <span className="font-black text-sm block leading-tight text-slate-950">Rivox Admin</span>
              <span className="text-[11px] text-slate-500 hidden sm:block">Owner command center</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <button onClick={() => setShowNotifications((v) => !v)} className="relative rounded-full border border-slate-200 bg-white p-2.5 hover:bg-slate-50">
                🔔
                {notifications.length > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white">{notifications.length}</span>}
              </button>
              {showNotifications && (
                <div className="absolute right-0 top-12 z-50 w-80 max-h-96 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl">
                  {notifications.length === 0 ? (
                    <p className="p-5 text-center text-sm text-slate-500">No unread notifications.</p>
                  ) : notifications.map((n) => (
                    <button key={n.id} onClick={() => markRead(n.id)} className="block w-full border-b border-slate-100 p-3.5 text-left hover:bg-slate-50">
                      <div className="text-sm font-bold text-slate-950">{n.title}</div>
                      {n.body && <div className="text-xs text-slate-500 mt-0.5">{n.body}</div>}
                      <div className="text-[10px] text-slate-400 mt-1">{new Date(n.created_at).toLocaleString()}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="hidden md:block text-right">
              <p className="text-xs font-semibold text-slate-700">{user?.email}</p>
              <p className="text-[11px] text-slate-400">Owner access</p>
            </div>
            <button
              onClick={handleSignOut}
              className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 transition flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="w-full p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
