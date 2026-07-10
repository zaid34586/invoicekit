import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

type ChatType = "direct" | "group" | "community";

type Channel = {
  id: string;
  name: string;
  description: string | null;
  channel_type: ChatType;
  kind: string;
  auto_join: boolean;
  created_at: string;
  last_message_at: string | null;
};

type Member = {
  channel_id: string;
  user_id: string;
  display_name: string;
  role: string;
  last_read_at: string | null;
};

type StaffMember = {
  id: string;
  auth_user_id: string | null;
  name: string | null;
  email: string;
  role: string;
  status: string;
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

type ViewTab = "chats" | "groups" | "community";

const roleLabel = (role: string) =>
  role
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter: string) => letter.toUpperCase());

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "R";

function Avatar({ name, online = false, size = "md" }: { name: string; online?: boolean; size?: "sm" | "md" | "lg" }) {
  const sizes = size === "lg" ? "h-12 w-12 text-base" : size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm";
  return (
    <div className="relative shrink-0">
      <div className={`${sizes} grid place-items-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-500 font-black text-white shadow-sm`}>
        {initials(name)}
      </div>
      {online && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />}
    </div>
  );
}

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
  const [members, setMembers] = useState<Member[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<ViewTab>("chats");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroup, setNewGroup] = useState({ name: "", description: "", autoJoin: true });
  const messageEndRef = useRef<HTMLDivElement | null>(null);

  const ensureMembership = async () => {
    if (!user) return;
    const { error } = await supabase.rpc("ensure_current_communication_membership", {
      p_display_name: actorName,
      p_role: actorRole,
    });
    if (error) setNotice(`Chat setup: ${error.message}`);
  };

  async function loadWorkspace(preferredId?: string | null) {
    if (!user) return;
    setLoading(true);
    setNotice(null);
    await ensureMembership();

    const [channelResult, memberResult, staffResult] = await Promise.all([
      supabase
        .from("communication_channels")
        .select("id, name, description, channel_type, kind, auto_join, created_at, last_message_at")
        .eq("archived", false)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: true }),
      supabase
        .from("communication_channel_members")
        .select("channel_id, user_id, display_name, role, last_read_at"),
      supabase
        .from("admin_team_members")
        .select("id, auth_user_id, name, email, role, status")
        .eq("status", "active")
        .order("name"),
    ]);

    if (channelResult.error) {
      setNotice(`Communication setup required: ${channelResult.error.message}`);
      setLoading(false);
      return;
    }

    const channelList = (channelResult.data ?? []) as Channel[];
    setChannels(channelList);
    setMembers((memberResult.data ?? []) as Member[]);
    setStaff((staffResult.data ?? []) as StaffMember[]);

    const nextId = preferredId ?? selectedId ?? channelList.find((item) => item.channel_type === "community")?.id ?? channelList[0]?.id ?? null;
    setSelectedId(nextId);
    setLoading(false);
  }

  async function loadMessages(channelId: string) {
    const { data, error } = await supabase
      .from("communication_messages")
      .select("id, channel_id, sender_user_id, sender_name, sender_role, body, created_at")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: true })
      .limit(250);
    if (error) {
      setNotice(error.message);
      return;
    }
    setMessages((data ?? []) as Message[]);
    await supabase.rpc("mark_communication_read", { p_channel_id: channelId });
    setMembers((current) => current.map((item) => item.channel_id === channelId && item.user_id === user?.id ? { ...item, last_read_at: new Date().toISOString() } : item));
  }

  useEffect(() => {
    void loadWorkspace();
  }, [user?.id]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    void loadMessages(selectedId);
    const realtime = supabase
      .channel(`rivox-chat:${selectedId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "communication_messages", filter: `channel_id=eq.${selectedId}` },
        (payload) => {
          setMessages((current) => current.some((item) => item.id === (payload.new as Message).id) ? current : [...current, payload.new as Message]);
          window.setTimeout(() => messageEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(realtime); };
  }, [selectedId]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const selected = useMemo(() => channels.find((item) => item.id === selectedId) ?? null, [channels, selectedId]);
  const selectedMembers = useMemo(() => members.filter((item) => item.channel_id === selectedId), [members, selectedId]);

  const directTitle = (channel: Channel) => {
    if (channel.channel_type !== "direct") return channel.name;
    return members.find((member) => member.channel_id === channel.id && member.user_id !== user?.id)?.display_name || "Direct message";
  };

  const visibleChannels = useMemo(() => {
    const type: ChatType = tab === "chats" ? "direct" : tab === "groups" ? "group" : "community";
    const query = search.trim().toLowerCase();
    return channels.filter((channel) => channel.channel_type === type).filter((channel) => {
      const title = directTitle(channel).toLowerCase();
      return !query || title.includes(query) || (channel.description ?? "").toLowerCase().includes(query);
    });
  }, [channels, members, search, tab, user?.id]);

  const availableStaff = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = staff.filter((person) => person.auth_user_id && person.auth_user_id !== user?.id);
    const owner = actorRole.toLowerCase().includes("owner")
      ? []
      : [{ id: "__owner__", auth_user_id: null, name: "Owner Admin", email: "Rivox Owner", role: "owner_admin", status: "active" } as StaffMember];
    return [...owner, ...list].filter((person) => !query || `${person.name ?? ""} ${person.email} ${person.role}`.toLowerCase().includes(query));
  }, [staff, user?.id, actorRole, search]);

  async function openDirect(person: StaffMember) {
    setNotice(null);
    const { data, error } = await supabase.rpc("get_or_create_direct_conversation", {
      p_target_team_member_id: person.id === "__owner__" ? null : person.id,
      p_target_owner: person.id === "__owner__",
      p_current_display_name: actorName,
      p_current_role: actorRole,
    });
    if (error) {
      setNotice(error.message);
      return;
    }
    const channelId = typeof data === "string" ? data : String(data);
    setTab("chats");
    await loadWorkspace(channelId);
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const body = draft.trim();
    if (!body || !selectedId || !user || sending) return;
    setSending(true);
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
    setSending(false);
  }

  async function createGroup(event: FormEvent) {
    event.preventDefault();
    if (!newGroup.name.trim()) return;
    const { data, error } = await supabase.rpc("create_communication_group", {
      p_name: newGroup.name.trim(),
      p_description: newGroup.description.trim() || null,
      p_auto_join: newGroup.autoJoin,
      p_creator_name: actorName,
      p_creator_role: actorRole,
    });
    if (error) {
      setNotice(error.message);
      return;
    }
    setNewGroup({ name: "", description: "", autoJoin: true });
    setShowNewGroup(false);
    setTab("groups");
    await loadWorkspace(typeof data === "string" ? data : String(data));
  }

  const unreadFor = (channel: Channel) => {
    const ownMember = members.find((member) => member.channel_id === channel.id && member.user_id === user?.id);
    if (!channel.last_message_at) return false;
    return !ownMember?.last_read_at || new Date(channel.last_message_at) > new Date(ownMember.last_read_at);
  };

  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_80px_-36px_rgba(15,23,42,0.28)]">
      <div className="grid min-h-[680px] lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-b border-slate-200 bg-slate-50/80 lg:border-b-0 lg:border-r">
          <div className="border-b border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-600">Rivox workspace</p>
                <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">Messages</h2>
              </div>
              {canManageChannels && (
                <button onClick={() => setShowNewGroup(true)} className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-950 text-xl font-light text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-violet-600" title="Create group">+</button>
              )}
            </div>
            <label className="mt-4 flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 focus-within:border-violet-400 focus-within:ring-4 focus-within:ring-violet-100">
              <span className="text-slate-400">⌕</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search people and conversations" className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400" />
            </label>
            <div className="mt-4 grid grid-cols-3 gap-1 rounded-2xl bg-slate-100 p-1">
              {(["chats", "groups", "community"] as ViewTab[]).map((item) => (
                <button key={item} onClick={() => { setTab(item); setSelectedId(null); }} className={`rounded-xl px-2 py-2 text-xs font-black capitalize transition ${tab === item ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {tab === "chats" && (
              <>
                <p className="px-2 pb-2 pt-1 text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">People</p>
                <div className="space-y-1">
                  {availableStaff.map((person) => (
                    <button key={person.id} onClick={() => void openDirect(person)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-white hover:shadow-sm">
                      <Avatar name={person.name || person.email} online />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-slate-900">{person.name || person.email}</span>
                        <span className="block truncate text-xs text-slate-500">{roleLabel(person.role)}</span>
                      </span>
                      <span className="text-xs text-slate-300">›</span>
                    </button>
                  ))}
                </div>
                {visibleChannels.length > 0 && <p className="px-2 pb-2 pt-5 text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Recent chats</p>}
              </>
            )}

            <div className="space-y-1">
              {visibleChannels.map((channel) => {
                const title = directTitle(channel);
                const active = channel.id === selectedId;
                const unread = unreadFor(channel);
                return (
                  <button key={channel.id} onClick={() => setSelectedId(channel.id)} className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${active ? "bg-violet-600 text-white shadow-lg shadow-violet-600/20" : "hover:bg-white hover:shadow-sm"}`}>
                    <Avatar name={title} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm font-bold ${active ? "text-white" : "text-slate-900"}`}>{title}</span>
                      <span className={`block truncate text-xs ${active ? "text-violet-100" : "text-slate-500"}`}>{channel.description || (channel.channel_type === "direct" ? "Personal conversation" : `${selectedMembers.length || "Team"} members`)}</span>
                    </span>
                    {unread && <span className={`h-2.5 w-2.5 rounded-full ${active ? "bg-white" : "bg-violet-600"}`} />}
                  </button>
                );
              })}
            </div>

            {!loading && visibleChannels.length === 0 && tab !== "chats" && (
              <div className="mx-2 mt-8 rounded-3xl border border-dashed border-slate-300 bg-white p-6 text-center">
                <div className="text-3xl">💬</div>
                <p className="mt-2 text-sm font-bold text-slate-800">No {tab} yet</p>
                <p className="mt-1 text-xs text-slate-500">Your Rivox workspace will appear here.</p>
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 bg-white p-4">
            <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
              <Avatar name={actorName} online size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-900">{actorName}</p>
                <p className="truncate text-xs text-slate-500">{roleLabel(actorRole)} · Online</p>
              </div>
            </div>
          </div>
        </aside>

        <section className="flex min-h-[680px] min-w-0 flex-col bg-white">
          {selected ? (
            <>
              <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={directTitle(selected)} online={selected.channel_type === "direct"} />
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-black text-slate-950">{directTitle(selected)}</h3>
                    <p className="truncate text-xs text-slate-500">{selected.channel_type === "direct" ? "Online now" : `${selectedMembers.length} members · ${selected.description || "Rivox team conversation"}`}</p>
                  </div>
                </div>
                <div className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold capitalize text-slate-600">{selected.channel_type}</div>
              </header>

              {notice && <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">{notice}</div>}
              <div className="flex-1 space-y-4 overflow-y-auto bg-[radial-gradient(circle_at_top,_rgba(124,58,237,0.06),_transparent_42%)] p-5 sm:p-7">
                {messages.length === 0 && (
                  <div className="mx-auto mt-20 max-w-sm text-center">
                    <Avatar name={directTitle(selected)} size="lg" />
                    <h4 className="mt-4 text-lg font-black text-slate-950">Start the conversation</h4>
                    <p className="mt-2 text-sm leading-6 text-slate-500">Share an update, ask a question or coordinate work with your Rivox team.</p>
                  </div>
                )}
                {messages.map((message, index) => {
                  const mine = message.sender_user_id === user?.id;
                  const previous = messages[index - 1];
                  const showAuthor = !previous || previous.sender_user_id !== message.sender_user_id;
                  return (
                    <div key={message.id} className={`flex gap-2.5 ${mine ? "justify-end" : "justify-start"}`}>
                      {!mine && <div className="w-8">{showAuthor && <Avatar name={message.sender_name} size="sm" />}</div>}
                      <div className={`max-w-[78%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
                        {showAuthor && !mine && <p className="mb-1 px-1 text-[11px] font-bold text-slate-500">{message.sender_name} · {roleLabel(message.sender_role)}</p>}
                        <div className={`rounded-2xl px-4 py-2.5 text-sm leading-6 shadow-sm ${mine ? "rounded-br-md bg-violet-600 text-white" : "rounded-bl-md border border-slate-200 bg-white text-slate-800"}`}>
                          <p className="whitespace-pre-wrap">{message.body}</p>
                        </div>
                        <p className="mt-1 px-1 text-[10px] text-slate-400">{new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                      </div>
                    </div>
                  );
                })}
                <div ref={messageEndRef} />
              </div>

              <form onSubmit={sendMessage} className="border-t border-slate-200 bg-white p-4 sm:p-5">
                <div className="flex items-end gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-2 focus-within:border-violet-400 focus-within:ring-4 focus-within:ring-violet-100">
                  <button type="button" className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-lg text-slate-500 transition hover:bg-white hover:text-violet-600" title="Attachments coming soon">＋</button>
                  <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} rows={1} placeholder="Write a message..." className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent px-1 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400" />
                  <button type="submit" disabled={!draft.trim() || sending} className="rounded-2xl bg-violet-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-violet-600/20 transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40">{sending ? "Sending" : "Send"}</button>
                </div>
              </form>
            </>
          ) : (
            <div className="grid flex-1 place-items-center bg-[radial-gradient(circle_at_center,_rgba(124,58,237,0.08),_transparent_50%)] p-8 text-center">
              <div className="max-w-md">
                <div className="mx-auto grid h-20 w-20 place-items-center rounded-[28px] bg-gradient-to-br from-violet-600 to-indigo-600 text-3xl text-white shadow-2xl shadow-violet-600/25">✦</div>
                <h3 className="mt-6 text-2xl font-black tracking-tight text-slate-950">Your team, one workspace</h3>
                <p className="mt-3 text-sm leading-6 text-slate-500">Choose a person for a private chat, open a group, or join the Rivox community.</p>
              </div>
            </div>
          )}
        </section>
      </div>

      {showNewGroup && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <form onSubmit={createGroup} className="w-full max-w-md rounded-[28px] border border-white/60 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-black uppercase tracking-[0.16em] text-violet-600">New workspace</p><h3 className="mt-1 text-xl font-black text-slate-950">Create a group</h3></div>
              <button type="button" onClick={() => setShowNewGroup(false)} className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200">×</button>
            </div>
            <div className="mt-6 space-y-4">
              <label className="block"><span className="mb-1.5 block text-sm font-bold text-slate-700">Group name</span><input value={newGroup.name} onChange={(event) => setNewGroup({ ...newGroup, name: event.target.value })} required placeholder="e.g. Customer Success" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100" /></label>
              <label className="block"><span className="mb-1.5 block text-sm font-bold text-slate-700">Purpose</span><textarea value={newGroup.description} onChange={(event) => setNewGroup({ ...newGroup, description: event.target.value })} rows={3} placeholder="What will this group be used for?" className="w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100" /></label>
              <label className="flex items-start gap-3 rounded-2xl bg-violet-50 p-4"><input type="checkbox" checked={newGroup.autoJoin} onChange={(event) => setNewGroup({ ...newGroup, autoJoin: event.target.checked })} className="mt-1 h-4 w-4 accent-violet-600" /><span><span className="block text-sm font-bold text-slate-800">Automatically add new staff</span><span className="mt-0.5 block text-xs leading-5 text-slate-500">Every new active staff member will join this group automatically.</span></span></label>
            </div>
            <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setShowNewGroup(false)} className="rounded-2xl px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100">Cancel</button><button type="submit" className="rounded-2xl bg-violet-600 px-5 py-2.5 text-sm font-black text-white shadow-lg shadow-violet-600/20 hover:bg-violet-500">Create group</button></div>
          </form>
        </div>
      )}
    </div>
  );
}
