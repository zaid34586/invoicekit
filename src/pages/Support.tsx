import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

type TicketStatus = "open" | "pending" | "resolved" | "closed";
type TicketPriority = "low" | "medium" | "high" | "urgent";

type SupportTicket = {
  id: string;
  user_id: string;
  ticket_number?: string | null;
  subject: string;
  message?: string | null;
  category?: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  assigned_to?: string | null;
  created_at: string;
  updated_at: string;
  last_reply_at?: string | null;
};

type TicketMessage = {
  id: string;
  ticket_id: string;
  author_user_id: string | null;
  author_type: "customer" | "staff" | "admin";
  message: string;
  is_internal: boolean;
  created_at: string;
};

const statusStyles: Record<TicketStatus, string> = {
  open: "bg-blue-50 text-blue-700 border-blue-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  resolved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  closed: "bg-slate-100 text-slate-600 border-slate-200",
};

const priorityStyles: Record<TicketPriority, string> = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-blue-50 text-blue-700",
  high: "bg-orange-50 text-orange-700",
  urgent: "bg-red-50 text-red-700",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function Support() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | TicketStatus>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [reply, setReply] = useState("");
  const [form, setForm] = useState({
    subject: "",
    category: "billing",
    priority: "medium" as TicketPriority,
    message: "",
  });

  async function loadTickets(selectFirst = false) {
    if (!user) return;
    setLoading(true);
    setError("");
    const { data, error: ticketError } = await supabase
      .from("admin_support_tickets")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (ticketError) {
      setError(ticketError.message);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as SupportTicket[];
    setTickets(rows);
    if ((selectFirst || !selectedId) && rows.length > 0) {
      setSelectedId(rows[0].id);
    }
    setLoading(false);
  }

  async function loadMessages(ticketId: string) {
    const { data, error: messageError } = await supabase
      .from("support_ticket_messages")
      .select("*")
      .eq("ticket_id", ticketId)
      .eq("is_internal", false)
      .order("created_at", { ascending: true });

    if (messageError) {
      setError(messageError.message);
      return;
    }
    setMessages((data ?? []) as TicketMessage[]);
  }

  useEffect(() => {
    void loadTickets(true);
  }, [user?.id]);

  useEffect(() => {
    if (selectedId) void loadMessages(selectedId);
    else setMessages([]);
  }, [selectedId]);

  const filteredTickets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter((ticket) => {
      const matchesStatus = statusFilter === "all" || ticket.status === statusFilter;
      const matchesSearch =
        !q ||
        ticket.subject.toLowerCase().includes(q) ||
        (ticket.ticket_number ?? "").toLowerCase().includes(q) ||
        (ticket.category ?? "").toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [tickets, search, statusFilter]);

  const selectedTicket = tickets.find((ticket) => ticket.id === selectedId) ?? null;

  async function createTicket(event: React.FormEvent) {
    event.preventDefault();
    if (!user || !form.subject.trim() || !form.message.trim()) return;
    setSaving(true);
    setError("");
    setNotice("");

    const { data, error: insertError } = await supabase
      .from("admin_support_tickets")
      .insert({
        user_id: user.id,
        subject: form.subject.trim(),
        message: form.message.trim(),
        category: form.category,
        priority: form.priority,
        status: "open",
        last_reply_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (insertError || !data) {
      setError(insertError?.message ?? "Unable to create ticket.");
      setSaving(false);
      return;
    }

    const ticket = data as SupportTicket;
    const { error: messageError } = await supabase.from("support_ticket_messages").insert({
      ticket_id: ticket.id,
      author_user_id: user.id,
      author_type: "customer",
      message: form.message.trim(),
      is_internal: false,
    });

    if (messageError) {
      setError(messageError.message);
      setSaving(false);
      return;
    }

    setForm({ subject: "", category: "billing", priority: "medium", message: "" });
    setShowCreate(false);
    setNotice("Support ticket created. Our team will reply here.");
    await loadTickets();
    setSelectedId(ticket.id);
    setSaving(false);
  }

  async function sendReply(event: React.FormEvent) {
    event.preventDefault();
    if (!user || !selectedTicket || !reply.trim()) return;
    if (selectedTicket.status === "closed") {
      setError("This ticket is closed. Create a new ticket for another issue.");
      return;
    }

    setSaving(true);
    setError("");
    const now = new Date().toISOString();
    const { error: replyError } = await supabase.from("support_ticket_messages").insert({
      ticket_id: selectedTicket.id,
      author_user_id: user.id,
      author_type: "customer",
      message: reply.trim(),
      is_internal: false,
    });

    if (replyError) {
      setError(replyError.message);
      setSaving(false);
      return;
    }

    await supabase
      .from("admin_support_tickets")
      .update({ status: "open", updated_at: now, last_reply_at: now })
      .eq("id", selectedTicket.id)
      .eq("user_id", user.id);

    setReply("");
    await Promise.all([loadMessages(selectedTicket.id), loadTickets()]);
    setSaving(false);
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <section className="rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-primary-950 p-6 sm:p-8 text-white overflow-hidden relative">
        <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-primary-500/20 blur-3xl" />
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <span className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide">CUSTOMER SUPPORT</span>
            <h1 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight">How can we help?</h1>
            <p className="mt-3 max-w-2xl text-sm sm:text-base text-slate-300">Create a ticket, track every response and keep your issue history in one secure place.</p>
          </div>
          <button onClick={() => setShowCreate(true)} className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-slate-100 transition shadow-lg">+ Create support ticket</button>
        </div>
      </section>

      {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-5"><p className="text-sm text-slate-500">Open tickets</p><p className="mt-2 text-3xl font-bold text-slate-900">{tickets.filter((t) => t.status === "open").length}</p></div>
        <div className="card p-5"><p className="text-sm text-slate-500">Waiting / pending</p><p className="mt-2 text-3xl font-bold text-slate-900">{tickets.filter((t) => t.status === "pending").length}</p></div>
        <div className="card p-5"><p className="text-sm text-slate-500">Resolved</p><p className="mt-2 text-3xl font-bold text-slate-900">{tickets.filter((t) => t.status === "resolved" || t.status === "closed").length}</p></div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[380px_minmax(0,1fr)] gap-5 min-h-[560px]">
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-slate-200 space-y-3">
            <input className="input" placeholder="Search tickets..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
                <option value="all">All statuses</option><option value="open">Open</option><option value="pending">Pending</option><option value="resolved">Resolved</option><option value="closed">Closed</option>
              </select>
              <button onClick={() => setShowCreate(true)} className="btn-primary">New ticket</button>
            </div>
          </div>
          <div className="max-h-[620px] overflow-y-auto divide-y divide-slate-100">
            {loading ? <p className="p-6 text-sm text-slate-500">Loading tickets...</p> : filteredTickets.length === 0 ? (
              <div className="p-8 text-center"><div className="text-4xl">🎫</div><p className="mt-3 font-semibold text-slate-800">No tickets found</p><p className="mt-1 text-sm text-slate-500">Create a ticket whenever you need help.</p></div>
            ) : filteredTickets.map((ticket) => (
              <button key={ticket.id} onClick={() => setSelectedId(ticket.id)} className={`w-full p-4 text-left hover:bg-slate-50 transition ${selectedId === ticket.id ? "bg-primary-50/70 border-l-4 border-primary-600" : "border-l-4 border-transparent"}`}>
                <div className="flex items-start justify-between gap-3"><p className="font-semibold text-slate-900 line-clamp-2">{ticket.subject}</p><span className={`text-[10px] uppercase font-bold rounded-full border px-2 py-1 ${statusStyles[ticket.status]}`}>{ticket.status}</span></div>
                <p className="mt-2 text-xs text-slate-500">{ticket.ticket_number || `#${ticket.id.slice(0, 8).toUpperCase()}`} · {formatDate(ticket.updated_at)}</p>
                <span className={`mt-3 inline-flex rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${priorityStyles[ticket.priority]}`}>{ticket.priority}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="card overflow-hidden flex flex-col">
          {!selectedTicket ? (
            <div className="flex flex-1 items-center justify-center p-10 text-center"><div><div className="text-5xl">💬</div><h2 className="mt-4 text-lg font-semibold text-slate-900">Select a ticket</h2><p className="mt-2 text-sm text-slate-500">Choose a ticket to view its conversation.</p></div></div>
          ) : (
            <>
              <div className="border-b border-slate-200 p-5 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div><p className="text-xs font-semibold uppercase tracking-wider text-primary-600">{selectedTicket.ticket_number || `Ticket #${selectedTicket.id.slice(0, 8).toUpperCase()}`}</p><h2 className="mt-2 text-xl font-bold text-slate-900">{selectedTicket.subject}</h2><p className="mt-2 text-sm text-slate-500">Category: <span className="capitalize">{selectedTicket.category || "general"}</span> · Created {formatDate(selectedTicket.created_at)}</p></div>
                  <div className="flex gap-2"><span className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${statusStyles[selectedTicket.status]}`}>{selectedTicket.status}</span><span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${priorityStyles[selectedTicket.priority]}`}>{selectedTicket.priority}</span></div>
                </div>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/70 p-5 sm:p-6 min-h-[300px] max-h-[480px]">
                {messages.length === 0 ? <p className="text-center text-sm text-slate-500">No messages yet.</p> : messages.map((item) => {
                  const mine = item.author_type === "customer";
                  return <div key={item.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}><div className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${mine ? "bg-primary-600 text-white rounded-br-md" : "bg-white border border-slate-200 text-slate-800 rounded-bl-md"}`}><div className="mb-1 flex items-center justify-between gap-6"><span className={`text-xs font-semibold ${mine ? "text-primary-100" : "text-slate-500"}`}>{mine ? "You" : "InvoiceKit Support"}</span><span className={`text-[10px] ${mine ? "text-primary-200" : "text-slate-400"}`}>{formatDate(item.created_at)}</span></div><p className="whitespace-pre-wrap text-sm leading-relaxed">{item.message}</p></div></div>;
                })}
              </div>

              <form onSubmit={sendReply} className="border-t border-slate-200 p-4 sm:p-5">
                {selectedTicket.status === "closed" ? <p className="rounded-xl bg-slate-100 p-3 text-center text-sm text-slate-600">This ticket is closed. Create a new ticket if you need more help.</p> : <div className="flex flex-col sm:flex-row gap-3"><textarea className="input min-h-24 flex-1" placeholder="Write a reply..." value={reply} onChange={(e) => setReply(e.target.value)} /><button disabled={saving || !reply.trim()} className="btn-primary self-end disabled:opacity-50">{saving ? "Sending..." : "Send reply"}</button></div>}
              </form>
            </>
          )}
        </div>
      </section>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm" onClick={() => setShowCreate(false)} />
          <form onSubmit={createTicket} className="relative card w-full max-w-xl p-6 sm:p-7 animate-scale-in">
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-primary-600">New support request</p><h2 className="mt-1 text-2xl font-bold text-slate-900">Tell us what happened</h2></div><button type="button" onClick={() => setShowCreate(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">✕</button></div>
            <div className="mt-6 space-y-4">
              <div><label className="label">Subject</label><input required className="input mt-1" placeholder="Example: Invoice balance is not updating" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div><label className="label">Category</label><select className="input mt-1" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}><option value="billing">Billing & plans</option><option value="invoice">Invoice issue</option><option value="account">Account & login</option><option value="payment">Payment</option><option value="technical">Technical issue</option><option value="other">Other</option></select></div><div><label className="label">Priority</label><select className="input mt-1" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as TicketPriority })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></div></div>
              <div><label className="label">Describe the issue</label><textarea required className="input mt-1 min-h-36" placeholder="Include the steps you took, what you expected and what happened instead." value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></div>
            </div>
            <div className="mt-6 flex justify-end gap-3"><button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button><button disabled={saving} className="btn-primary disabled:opacity-50">{saving ? "Creating..." : "Create ticket"}</button></div>
          </form>
        </div>
      )}
    </div>
  );
}
