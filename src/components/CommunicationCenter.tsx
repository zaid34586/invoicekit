import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

type Channel = {
  id: string;
  name: string;
  description: string | null;
  kind: "team" | "support" | "finance" | "announcement";
  created_at: string;
};

type Message = {
  id: string;
  channel_id: string;
  sender_user_id: string;
  sender_name: string;
  sender_role: string;
  body: string;
  created_at: string;
};

export default function CommunicationCenter({
  actorName,
  actorRole,
  canManageChannels = false,
}: {
  actorName: string;
  actorRole: string;
  canManageChannels?: boolean;
}) {
  const { user } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [newChannel, setNewChannel] = useState({ name: "", description: "", kind: "team" as Channel["kind"] });

  async function loadChannels() {
    const { data, error } = await supabase
      .from("communication_channels")
      .select("id, name, description, kind, created_at")
      .eq("archived", false)
      .order("kind")
      .order("name");
    if (error) {
      setNotice(`Communication setup required: ${error.message}`);
      setLoading(false);
      return;
    }
    const list = (data as Channel[]) ?? [];
    setChannels(list);
    setSelectedId((current) => current ?? list[0]?.id ?? null);
    setLoading(false);
  }

  async function loadMessages(channelId: string) {
    const { data, error } = await supabase
      .from("communication_messages")
      .select("id, channel_id, sender_user_id, sender_name, sender_role, body, created_at")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: true })
      .limit(150);
    if (error) {
      setNotice(error.message);
      return;
    }
    setMessages((data as Message[]) ?? []);
  }

  useEffect(() => { loadChannels(); }, []);

  useEffect(() => {
    if (!selectedId) return;
    loadMessages(selectedId);
    const channel = supabase
      .channel(`communication:${selectedId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "communication_messages", filter: `channel_id=eq.${selectedId}` },
        (payload) => setMessages((current) => [...current, payload.new as Message]),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedId]);

  const selected = useMemo(() => channels.find((channel) => channel.id === selectedId) ?? null, [channels, selectedId]);

  async function sendMessage() {
    const body = draft.trim();
    if (!body || !selectedId || !user) return;
    setDraft("");
    const { error } = await supabase.from("communication_messages").insert({
      channel_id: selectedId,
      sender_user_id: user.id,
      sender_name: actorName,
      sender_role: actorRole,
      body,
    });
    if (error) {
      setDraft(body);
      setNotice(error.message);
    }
  }

  async function createChannel() {
    if (!newChannel.name.trim() || !user) return;
    const { error } = await supabase.from("communication_channels").insert({
      name: newChannel.name.trim(),
      description: newChannel.description.trim() || null,
      kind: newChannel.kind,
      created_by: user.id,
    });
    if (error) {
      setNotice(error.message);
      return;
    }
    setNewChannel({ name: "", description: "", kind: "team" });
    setNotice("Channel created.");
    await loadChannels();
  }

  return (
    <div className="grid min-h-[620px] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[300px_1fr]">
      <aside className="border-b border-slate-200 bg-slate-950 p-4 text-white lg:border-b-0 lg:border-r">
        <div className="mb-5 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">Communication center</p>
          <h2 className="mt-2 text-xl font-black">Rivox Team</h2>
          <p className="mt-1 text-sm text-slate-400">Internal channels, task discussions and announcements.</p>
        </div>
        <div className="space-y-2">
          {channels.map((channel) => (
            <button
              key={channel.id}
              onClick={() => setSelectedId(channel.id)}
              className={`w-full rounded-2xl px-4 py-3 text-left transition ${selectedId === channel.id ? "bg-white text-slate-950 shadow-lg" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-bold"># {channel.name}</span>
                <span className="text-[10px] uppercase tracking-wide opacity-60">{channel.kind}</span>
              </div>
              {channel.description && <p className="mt-1 line-clamp-2 text-xs opacity-70">{channel.description}</p>}
            </button>
          ))}
        </div>
        {canManageChannels && (
          <div className="mt-5 space-y-2 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">New channel</p>
            <input value={newChannel.name} onChange={(e) => setNewChannel({ ...newChannel, name: e.target.value })} placeholder="Channel name" className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-500" />
            <input value={newChannel.description} onChange={(e) => setNewChannel({ ...newChannel, description: e.target.value })} placeholder="Short purpose" className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-500" />
            <select value={newChannel.kind} onChange={(e) => setNewChannel({ ...newChannel, kind: e.target.value as Channel["kind"] })} className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white">
              <option value="team">Team</option><option value="support">Support</option><option value="finance">Finance</option><option value="announcement">Announcement</option>
            </select>
            <button onClick={createChannel} className="w-full rounded-xl bg-violet-500 px-3 py-2 text-sm font-bold hover:bg-violet-400">Create channel</button>
          </div>
        )}
      </aside>

      <section className="flex min-w-0 flex-col">
        <header className="border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <h3 className="text-lg font-black text-slate-950">{selected ? `# ${selected.name}` : "Select a channel"}</h3>
          <p className="mt-1 text-sm text-slate-500">{selected?.description || "Choose a team channel to start communication."}</p>
        </header>
        {notice && <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">{notice}</div>}
        <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/70 p-5 sm:p-6">
          {loading ? <p className="text-sm text-slate-500">Loading communication center...</p> : null}
          {!loading && selected && messages.length === 0 ? (
            <div className="mx-auto mt-16 max-w-md rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <div className="text-4xl">💬</div>
              <h4 className="mt-3 font-black text-slate-950">Start this conversation</h4>
              <p className="mt-2 text-sm text-slate-500">Share updates, blockers, customer context or task decisions with the team.</p>
            </div>
          ) : null}
          {messages.map((message) => {
            const mine = message.sender_user_id === user?.id;
            return (
              <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[82%] rounded-3xl px-4 py-3 shadow-sm ${mine ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-800"}`}>
                  <div className={`mb-1 flex items-center gap-2 text-xs font-bold ${mine ? "text-violet-200" : "text-slate-500"}`}>
                    <span>{message.sender_name}</span><span className="font-medium opacity-70">{message.sender_role}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-6">{message.body}</p>
                  <p className={`mt-2 text-[10px] ${mine ? "text-slate-400" : "text-slate-400"}`}>{new Date(message.created_at).toLocaleString()}</p>
                </div>
              </div>
            );
          })}
        </div>
        <footer className="border-t border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex gap-3">
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} disabled={!selectedId} placeholder="Write an update... Enter to send, Shift+Enter for a new line" className="min-h-[52px] flex-1 resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100" />
            <button onClick={sendMessage} disabled={!selectedId || !draft.trim()} className="rounded-2xl bg-violet-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-violet-600/20 hover:bg-violet-500 disabled:opacity-40">Send</button>
          </div>
        </footer>
      </section>
    </div>
  );
}
