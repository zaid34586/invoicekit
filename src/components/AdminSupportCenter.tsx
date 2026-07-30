import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type TicketStatus = "open" | "in_progress" | "waiting_customer" | "pending" | "resolved" | "closed";
type Priority = "low" | "medium" | "high" | "urgent";
type Ticket = {
  id: string; user_id: string | null; ticket_number: string | null; subject: string; message: string | null;
  category: string | null; status: TicketStatus; priority: Priority; assigned_to: string | null;
  plan_at_creation: string | null; sla_target_minutes: number | null; first_admin_reply_at: string | null;
  resolution_summary: string | null; tags: string[] | null; created_at: string; updated_at: string;
};
type Message = { id: string; author_type: "customer" | "staff" | "admin"; message: string; is_internal: boolean; created_at: string };
type Attachment = { id: string; file_name: string; storage_path: string; signed_url?: string };
type ProfileLite = { id: string; user_id?: string | null; email?: string | null; business_name?: string | null; plan?: string | null; subscription_status?: string | null; subscription_id?: string | null };
type Agent = { id: string; name: string | null; email: string; role: string; status: string };

const statuses: TicketStatus[] = ["open", "in_progress", "waiting_customer", "pending", "resolved", "closed"];
const statusLabel: Record<TicketStatus, string> = { open: "New / Open", in_progress: "In progress", waiting_customer: "Waiting for customer", pending: "Pending", resolved: "Resolved", closed: "Closed" };

function deadline(ticket: Ticket) {
  return new Date(new Date(ticket.created_at).getTime() + Number(ticket.sla_target_minutes || 1440) * 60000);
}
function sla(ticket: Ticket) {
  if (ticket.first_admin_reply_at) return { label: "First response sent", tone: "text-emerald-700 bg-emerald-50 border-emerald-200", breached: false };
  const minutes = Math.ceil((deadline(ticket).getTime() - Date.now()) / 60000);
  if (minutes <= 0) return { label: `SLA breached ${Math.abs(minutes)}m ago`, tone: "text-red-700 bg-red-50 border-red-200", breached: true };
  if (minutes < 30) return { label: `${minutes}m remaining`, tone: "text-amber-700 bg-amber-50 border-amber-200", breached: false };
  const hours = Math.floor(minutes / 60); const rest = minutes % 60;
  return { label: hours ? `${hours}h ${rest}m remaining` : `${rest}m remaining`, tone: "text-blue-700 bg-blue-50 border-blue-200", breached: false };
}
function date(value: string) { return new Date(value).toLocaleString(); }

export default function AdminSupportCenter({ profiles, team }: { profiles: ProfileLite[]; team: Agent[] }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"all" | "unassigned" | "urgent" | "breached">("all");
  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);
  const [resolution, setResolution] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [, setClock] = useState(Date.now());
  const [toast, setToast] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<{ id: string; name: string; open_count: number } | null>(null);

  function showToast(text: string) {
    setToast(text);
    window.setTimeout(() => setToast((current) => (current === text ? null : current)), 2000);
  }

  const agents = team.filter((member) => member.status === "active" && ["full_access", "support", "limited"].includes(member.role));

  async function load() {
    const { data, error } = await supabase.from("admin_support_tickets").select("*").order("updated_at", { ascending: false }).limit(200);
    if (error) { setNotice(error.message); return; }
    const rows = (data || []) as Ticket[];
    setTickets(rows);
    setSelectedId((current) => current && rows.some((row) => row.id === current) ? current : rows[0]?.id || null);
  }

  async function loadDetail(ticketId: string) {
    const [messageResult, attachmentResult] = await Promise.all([
      supabase.from("support_ticket_messages").select("id,author_type,message,is_internal,created_at").eq("ticket_id", ticketId).order("created_at"),
      supabase.from("support_ticket_attachments").select("id,file_name,storage_path").eq("ticket_id", ticketId).order("created_at"),
    ]);
    setMessages((messageResult.data || []) as Message[]);
    const signed = await Promise.all(((attachmentResult.data || []) as Attachment[]).map(async (item) => {
      const { data } = await supabase.storage.from("support-attachments").createSignedUrl(item.storage_path, 3600);
      return { ...item, signed_url: data?.signedUrl };
    }));
    setAttachments(signed);
  }

  useEffect(() => { void load(); const timer = window.setInterval(() => setClock(Date.now()), 60000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { if (selectedId) void loadDetail(selectedId); }, [selectedId]);

  const filtered = useMemo(() => tickets.filter((ticket) => {
    const q = search.trim().toLowerCase();
    const matches = !q || [ticket.ticket_number, ticket.subject, ticket.message, ticket.category, ticket.plan_at_creation].some((value) => String(value || "").toLowerCase().includes(q));
    if (!matches) return false;
    if (view === "unassigned") return !ticket.assigned_to && !["resolved", "closed"].includes(ticket.status);
    if (view === "urgent") return ticket.priority === "urgent" && !["resolved", "closed"].includes(ticket.status);
    if (view === "breached") return sla(ticket).breached && !["resolved", "closed"].includes(ticket.status);
    return true;
  }), [tickets, search, view]);
  const selected = tickets.find((ticket) => ticket.id === selectedId) || null;
  const customer = selected ? profiles.find((profile) => profile.user_id === selected.user_id || profile.id === selected.user_id) : undefined;
  const selectedIsFinal = Boolean(selected && ["resolved", "closed"].includes(selected.status));

  useEffect(() => {
    if (!selected || selected.assigned_to) { setSuggestion(null); return; }
    let cancelled = false;
    void supabase
      .rpc("admin_suggest_assignee", { p_kind: "ticket", p_text: `${selected.subject || ""} ${selected.message || ""}` })
      .then(({ data }: { data: unknown }) => {
        if (cancelled) return;
        const row = Array.isArray(data) ? (data[0] as { member_id: string; name: string | null; email: string; open_count: number } | undefined) : undefined;
        setSuggestion(row ? { id: row.member_id, name: row.name || row.email, open_count: row.open_count } : null);
      });
    return () => { cancelled = true; };
  }, [selected?.id, selected?.assigned_to]);

  async function patchTicket(changes: Partial<Ticket>, success: string) {
    if (!selected) return;
    setBusy(true);
    const { error } = await supabase.from("admin_support_tickets").update({ ...changes, updated_at: new Date().toISOString() }).eq("id", selected.id);
    setBusy(false); setNotice(error?.message || success);
    if (!error) {
      if (changes.assigned_to !== undefined) {
        const agent = agents.find((a) => a.id === changes.assigned_to);
        showToast(agent ? `Assigned to ${agent.name || agent.email} ✓` : "Ticket unassigned");
      }
      await load();
    }
  }

  async function sendReply(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !reply.trim()) return;
    setBusy(true);
    const { data: auth } = await supabase.auth.getUser();
    const now = new Date().toISOString();
    const { error } = await supabase.from("support_ticket_messages").insert({ ticket_id: selected.id, author_user_id: auth.user?.id, author_type: "admin", message: reply.trim(), is_internal: internal });
    if (!error) {
      const nextStatus: TicketStatus = internal ? selected.status : "waiting_customer";
      await supabase.from("admin_support_tickets").update({ status: nextStatus, updated_at: now, last_reply_at: now, last_admin_reply_at: now, ...(!internal && !selected.first_admin_reply_at ? { first_admin_reply_at: now } : {}) }).eq("id", selected.id);
      await supabase.from("admin_audit_logs").insert({ actor_user_id: auth.user?.id, action: internal ? "support_internal_note" : "support_reply", target_type: "support_ticket", target_id: selected.id, details: { ticket_number: selected.ticket_number } });
    }
    setBusy(false); setNotice(error?.message || (internal ? "Internal note added." : "Reply sent to customer."));
    if (!error) { setReply(""); setInternal(false); await Promise.all([load(), loadDetail(selected.id)]); }
  }

  async function resolve() {
    if (!selected) return;
    if (selectedIsFinal) { setNotice("This ticket is already finalised. Reopen it before resolving again."); return; }
    if (!resolution.trim()) { setNotice("Resolution summary is required before resolving a ticket."); return; }
    await patchTicket({ status: "resolved", resolution_summary: resolution.trim() }, "Ticket resolved.");
    setResolution("");
  }

  const open = tickets.filter((t) => !["resolved", "closed"].includes(t.status));
  const breached = open.filter((t) => sla(t).breached).length;

  return <section className="space-y-6">
    {toast && <div className="fixed top-6 right-6 z-50 rounded-xl bg-slate-900 text-white px-4 py-3 text-sm font-bold shadow-2xl">{toast}</div>}
    <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-6 text-white shadow-xl">
      <p className="text-xs font-black uppercase tracking-[.2em] text-indigo-300">Customer operations</p>
      <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><h1 className="text-3xl font-black">Support Command Center</h1><p className="mt-2 text-sm text-slate-300">SLA, customer context, assignment and complete conversations in one workspace.</p></div><button onClick={() => void load()} className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-bold">Refresh inbox</button></div>
    </div>
    {notice && <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">{notice}</div>}
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
      {[["Active", open.length, "🎫"], ["Unassigned", open.filter(t => !t.assigned_to).length, "👤"], ["Urgent", open.filter(t => t.priority === "urgent").length, "🚨"], ["SLA breached", breached, "⏱️"], ["Resolved", tickets.filter(t => t.status === "resolved").length, "✅"]].map(([label, value, icon]) => <div key={String(label)} className="card p-5"><div className="text-xl">{icon}</div><div className="mt-2 text-3xl font-black">{value}</div><div className="text-xs font-bold text-slate-500">{label}</div></div>)}
    </div>
    <div className="grid min-h-[680px] gap-5 xl:grid-cols-[340px_minmax(0,1fr)_300px]">
      <div className="card overflow-hidden"><div className="space-y-3 border-b p-4"><input className="input" placeholder="Search ticket, user, plan..." value={search} onChange={(e) => setSearch(e.target.value)}/><select className="input" value={view} onChange={(e) => setView(e.target.value as typeof view)}><option value="all">All tickets</option><option value="unassigned">Unassigned</option><option value="urgent">Urgent</option><option value="breached">SLA breached</option></select></div><div className="max-h-[720px] divide-y overflow-y-auto">{filtered.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No matching tickets.</p> : filtered.map((ticket) => { const timer = sla(ticket); return <button key={ticket.id} onClick={() => setSelectedId(ticket.id)} className={`w-full border-l-4 p-4 text-left hover:bg-slate-50 ${selectedId === ticket.id ? "border-indigo-600 bg-indigo-50/60" : "border-transparent"}`}><div className="flex justify-between gap-2"><b className="line-clamp-2 text-sm">{ticket.subject}</b><span className="text-[10px] font-black uppercase text-slate-400">{ticket.priority}</span></div><p className="mt-1 text-xs text-slate-500">{ticket.ticket_number || ticket.id.slice(0,8)} · {ticket.plan_at_creation || "free"}</p><div className="mt-2 flex items-center justify-between gap-2"><span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold ${timer.tone}`}>{timer.label}</span>{ticket.assigned_to && <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-black text-white" title={agents.find(a => a.id === ticket.assigned_to)?.name || ""}>{(agents.find(a => a.id === ticket.assigned_to)?.name || agents.find(a => a.id === ticket.assigned_to)?.email || "?")[0]?.toUpperCase()}</span>}</div></button>; })}</div></div>
      <div className="card flex min-w-0 flex-col overflow-hidden">{!selected ? <div className="flex flex-1 items-center justify-center p-10 text-slate-500">Select a ticket</div> : <><div className="border-b p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row"><div><p className="text-xs font-black uppercase tracking-wide text-indigo-600">{selected.ticket_number || selected.id}</p><h2 className="mt-1 text-xl font-black">{selected.subject}</h2><p className="mt-1 text-sm text-slate-500">{selected.category || "general"} · {date(selected.created_at)}</p></div><span className={`h-fit rounded-full border px-3 py-1 text-xs font-bold ${sla(selected).tone}`}>{sla(selected).label}</span></div></div><div className="max-h-[430px] flex-1 space-y-3 overflow-y-auto bg-slate-50 p-5">{messages.length === 0 && <p className="text-center text-sm text-slate-500">No conversation yet.</p>}{messages.map((message) => <div key={message.id} className={`max-w-[88%] rounded-2xl border p-3 text-sm ${message.is_internal ? "bg-amber-50 border-amber-200" : message.author_type === "customer" ? "ml-auto bg-white border-slate-200" : "bg-indigo-50 border-indigo-200"}`}><div className="mb-1 flex justify-between gap-4 text-[10px] font-bold uppercase text-slate-500"><span>{message.is_internal ? "Internal note" : message.author_type}</span><span>{date(message.created_at)}</span></div><p className="whitespace-pre-wrap">{message.message}</p></div>)}</div>{attachments.length > 0 && <div className="border-t p-4"><p className="mb-2 text-xs font-bold text-slate-500">EVIDENCE</p><div className="flex gap-2 overflow-x-auto">{attachments.map(item => <a key={item.id} href={item.signed_url} target="_blank" rel="noreferrer"><img className="h-20 w-28 rounded-xl border object-cover" src={item.signed_url} alt={item.file_name}/></a>)}</div></div>}<form onSubmit={sendReply} className="space-y-3 border-t p-4"><textarea className="input min-h-24" placeholder={internal ? "Write an internal note..." : "Reply to customer..."} value={reply} onChange={(e) => setReply(e.target.value)}/><div className="flex flex-wrap items-center justify-between gap-3"><label className="text-sm text-slate-600"><input className="mr-2" type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)}/>Internal note</label><button disabled={busy || !reply.trim()} className="btn-primary disabled:opacity-50">{busy ? "Saving..." : internal ? "Add note" : "Send reply"}</button></div></form></>}</div>
      <aside className="space-y-4"><div className="card p-5"><p className="text-xs font-black uppercase text-slate-400">Customer context</p><h3 className="mt-2 font-black">{customer?.business_name || customer?.email || "Unknown customer"}</h3><p className="text-sm text-slate-500">{customer?.email || selected?.user_id || "No linked user"}</p><div className="mt-4 grid grid-cols-2 gap-2 text-xs"><div className="rounded-xl bg-slate-50 p-3"><b>Plan</b><p className="mt-1 capitalize">{customer?.plan || selected?.plan_at_creation || "free"}</p></div><div className="rounded-xl bg-slate-50 p-3"><b>Billing</b><p className="mt-1 capitalize">{customer?.subscription_status || "unknown"}</p></div></div></div>{selected && <div className="card space-y-3 p-5"><p className="text-xs font-black uppercase text-slate-400">Ticket controls</p><label className="block text-xs font-bold text-slate-500">Status<select className="input mt-1" value={selected.status} onChange={(e) => void patchTicket({ status: e.target.value as TicketStatus }, "Status updated.")}>{statuses.map(status => <option key={status} value={status}>{statusLabel[status]}</option>)}</select></label><label className="block text-xs font-bold text-slate-500">Assignee<select className="input mt-1" value={selected.assigned_to || ""} onChange={(e) => void patchTicket({ assigned_to: e.target.value || null }, "Ticket assigned.")}><option value="">Unassigned</option>{agents.map(agent => <option key={agent.id} value={agent.id}>{agent.name || agent.email}</option>)}</select></label>{suggestion && !selected.assigned_to && <button type="button" onClick={() => void patchTicket({ assigned_to: suggestion.id }, "Ticket assigned.")} className="w-full flex items-center justify-between rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"><span>💡 Suggested: {suggestion.name} ({suggestion.open_count} open)</span><span className="underline">Use</span></button>}<label className="block text-xs font-bold text-slate-500">Priority<div className="mt-1 flex items-center gap-1">{([["low", "⚪", "Low", "bg-slate-100 text-slate-600 border-slate-200"], ["medium", "🟡", "Med", "bg-amber-50 text-amber-700 border-amber-200"], ["high", "🟠", "High", "bg-orange-50 text-orange-700 border-orange-200"], ["urgent", "🔴", "Urgent", "bg-red-50 text-red-700 border-red-200"]] as const).map(([value, dot, label, cls]) => <button key={value} type="button" onClick={() => void patchTicket({ priority: value as Priority }, "Priority updated.")} className={`flex-1 rounded-lg border px-1.5 py-2 text-[11px] font-bold ${selected.priority === value ? cls + " ring-2 ring-offset-1 ring-primary-400" : "bg-white text-slate-400 border-slate-200"}`}>{dot} {label}</button>)}</div></label><textarea className="input min-h-20" placeholder="Required resolution summary" value={resolution} onChange={(e) => setResolution(e.target.value)}/><button disabled={busy} onClick={() => void resolve()} className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white">Resolve ticket</button></div>}</aside>
    </div>
  </section>;
}
