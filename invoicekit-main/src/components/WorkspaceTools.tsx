import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type ToolLog = { id: string; tool_key: string; summary: string; metadata: Record<string, unknown>; created_at: string };

const CHANNELS = [
  { key: "call", label: "📞 Phone call" },
  { key: "whatsapp", label: "💬 WhatsApp" },
  { key: "email", label: "✉️ Email" },
  { key: "meeting", label: "🤝 Meeting" },
];

// Extensible workspace tools panel. Any future integration (a real WhatsApp
// Business API send, a calendar booking, a data export) plugs in as one more
// small card here and logs to the same `workspace_tool_logs` table -- the
// panel, the audit trail, and the RLS access rule (staff can only touch
// tools on items assigned to them) don't need to change per tool.
export default function WorkspaceTools({ itemType, itemId, performedBy }: { itemType: "task" | "ticket"; itemId: string; performedBy: string | undefined }) {
  const [logs, setLogs] = useState<ToolLog[]>([]);
  const [note, setNote] = useState("");
  const [channel, setChannel] = useState(CHANNELS[0].key);
  const [contactNote, setContactNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { void load(); }, [itemType, itemId]);

  async function load() {
    const { data } = await supabase.from("workspace_tool_logs").select("id,tool_key,summary,metadata,created_at").eq("item_type", itemType).eq("item_id", itemId).order("created_at", { ascending: false });
    setLogs((data as ToolLog[]) ?? []);
  }

  async function logAction(toolKey: string, summary: string, metadata: Record<string, unknown> = {}) {
    if (!performedBy) return;
    setBusy(true);
    await supabase.from("workspace_tool_logs").insert({ item_type: itemType, item_id: itemId, tool_key: toolKey, summary, metadata, performed_by: performedBy });
    setBusy(false);
    await load();
  }

  return (
    <div className="rounded-2xl border border-slate-200 p-4 space-y-4">
      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Workspace tools</div>

      <div className="space-y-2">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Quick note (research done, what you found, next step...)" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm min-h-[70px]" />
        <button disabled={busy || !note.trim()} onClick={() => { void logAction("note", note.trim()); setNote(""); }} className="rounded-xl bg-slate-950 text-white px-3 py-2 text-xs font-bold disabled:opacity-50">Add note</button>
      </div>

      <div className="space-y-2 border-t border-slate-100 pt-3">
        <div className="space-y-2">
          <select value={channel} onChange={(e) => setChannel(e.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2 text-xs">
            {CHANNELS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <input value={contactNote} onChange={(e) => setContactNote(e.target.value)} placeholder="What happened..." className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs" />
        </div>
        <button
          disabled={busy || !contactNote.trim()}
          onClick={() => { const c = CHANNELS.find((x) => x.key === channel)!; void logAction(channel, `${c.label}: ${contactNote.trim()}`, { channel }); setContactNote(""); }}
          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >Log contact</button>
        <p className="text-[10px] text-slate-400">More tools (real WhatsApp send, calendar booking, data export) plug in here later — same panel, same log.</p>
      </div>

      {logs.length > 0 && (
        <div className="border-t border-slate-100 pt-3 space-y-2 max-h-[180px] overflow-y-auto">
          {logs.map((l) => (
            <div key={l.id} className="text-xs text-slate-600"><span className="text-slate-400">{new Date(l.created_at).toLocaleString()}</span> — {l.summary}</div>
          ))}
        </div>
      )}
    </div>
  );
}
