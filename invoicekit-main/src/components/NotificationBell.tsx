import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

type NotificationRow = {
  id: string;
  title: string;
  body: string | null;
  type: string;
  read_at: string | null;
  created_at: string;
};

// Loud, pleasant two-note chime (like a doorbell "ding-dong") built entirely
// with the Web Audio API -- no external mp3/wav file to host or bundle.
function playNotificationChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    function tone(freq: number, start: number, duration: number, peakGain: number) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + start);
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(peakGain, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + duration + 0.05);
    }

    // Bright high note, then a fuller low note right after -- loud (0.9 gain)
    // and cuts through easily even with system volume turned down a bit.
    tone(1318.5, 0, 0.35, 0.9); // E6
    tone(987.77, 0.18, 0.5, 0.9); // B5

    window.setTimeout(() => void ctx.close(), 1200);
  } catch {
    // Some browsers block audio until the user has interacted with the page
    // at least once -- fail silently rather than throwing.
  }
}

export default function NotificationBell() {
  const { user } = useAuth();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);
  const seenIds = useRef<Set<string> | null>(null);

  async function load() {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("id,title,body,type,read_at,created_at")
      .eq("audience", "user")
      .eq("recipient_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);
    const rows = (data as NotificationRow[]) ?? [];

    if (seenIds.current === null) {
      // First load after mount: just record what already exists, don't
      // chime for a backlog of old notifications the user hasn't seen yet.
      seenIds.current = new Set(rows.map((r) => r.id));
    } else {
      const hasNew = rows.some((r) => !seenIds.current!.has(r.id));
      if (hasNew) playNotificationChime();
      seenIds.current = new Set(rows.map((r) => r.id));
    }

    setItems(rows);
  }

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const unreadCount = items.filter((n) => !n.read_at).length;

  async function markRead(id: string) {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
  }

  async function markAllRead() {
    const unreadIds = items.filter((n) => !n.read_at).map((n) => n.id);
    if (unreadIds.length === 0) return;
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", unreadIds);
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })));
  }

  if (!user) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-lg hover:bg-slate-100 transition"
        aria-label="Notifications"
      >
        <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-80 rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <span className="text-sm font-bold text-slate-900">Notifications</span>
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-xs font-semibold text-violet-600 hover:text-violet-800">
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-400">No notifications yet.</p>
              ) : (
                items.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => !n.read_at && markRead(n.id)}
                    className={`block w-full border-b border-slate-50 px-4 py-3 text-left transition last:border-0 hover:bg-slate-50 ${!n.read_at ? "bg-violet-50/60" : ""}`}
                  >
                    <div className="flex items-start gap-2">
                      {!n.read_at && <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-violet-600" />}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                        {n.body && <p className="mt-0.5 text-xs text-slate-500">{n.body}</p>}
                        <p className="mt-1 text-[11px] text-slate-400">
                          {new Date(n.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
