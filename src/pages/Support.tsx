import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

type TicketStatus = "open" | "in_progress" | "waiting_customer" | "pending" | "resolved" | "closed";
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
  plan_at_creation?: string | null;
  sla_target_minutes?: number | null;
  first_admin_reply_at?: string | null;
  resolution_summary?: string | null;
  csat_rating?: "up" | "down" | null;
};

type TicketAttachment = {
  id: string;
  ticket_id: string;
  file_name: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  signed_url?: string;
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
  in_progress: "bg-violet-50 text-violet-700 border-violet-200",
  waiting_customer: "bg-cyan-50 text-cyan-700 border-cyan-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  resolved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  closed: "bg-slate-100 text-slate-600 border-slate-200",
};

function supportSla(ticket: SupportTicket) {
  if (ticket.first_admin_reply_at) return "First response sent";
  const due = new Date(ticket.created_at).getTime() + Number(ticket.sla_target_minutes || 1440) * 60000;
  const minutes = Math.ceil((due - Date.now()) / 60000);
  if (minutes <= 0) return "Response SLA escalated";
  if (minutes < 60) return `Target response in ${minutes} minutes`;
  return `Target response in ${Math.ceil(minutes / 60)} hours`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function Support() {
  const { user, profile, workspaceOwnerId, workspaceName } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
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
    message: "",
  });

  const planName = (profile?.plan || "free").toLowerCase();
  const automaticPriority: TicketPriority = planName === "business" ? "urgent" : planName === "pro" ? "high" : "medium";
  const supportLevel = planName === "business"
    ? { name: "Fastest Support", detail: "Highest-priority handling · target first response within 1 hour", color: "bg-amber-400/15 text-amber-200 border-amber-300/20" }
    : planName === "pro"
      ? { name: "Fast Support", detail: "High-priority handling · target first response within 1–2 hours", color: "bg-violet-400/15 text-violet-200 border-violet-300/20" }
      : { name: "Standard Support", detail: "Normal queue · target first response within 1 business day", color: "bg-white/10 text-slate-200 border-white/15" };

  async function loadTickets(selectFirst = false) {
    if (!user) return;
    setLoading(true);
    setError("");
    const { data, error: ticketError } = await supabase
      .from("admin_support_tickets")
      .select("*")
      .eq("user_id", workspaceOwnerId || user.id)
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

  async function loadAttachments(ticketId: string) {
    const { data, error: attachmentError } = await supabase
      .from("support_ticket_attachments")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });
    if (attachmentError) {
      setAttachments([]);
      return;
    }
    const rows = (data ?? []) as TicketAttachment[];
    const signed = await Promise.all(rows.map(async (item) => {
      const { data: urlData } = await supabase.storage.from("support-attachments").createSignedUrl(item.storage_path, 3600);
      return { ...item, signed_url: urlData?.signedUrl };
    }));
    setAttachments(signed);
  }

  function validateAttachment(file: File) {
    const allowed = ["image/png", "image/jpeg", "image/webp"];
    if (!allowed.includes(file.type)) return "Only PNG, JPG or WEBP screenshots are allowed.";
    if (file.size > 5 * 1024 * 1024) return "Screenshot must be 5 MB or smaller.";
    return "";
  }

  async function uploadAttachment(ticketId: string, file: File) {
    if (!user) throw new Error("You must be signed in.");
    const validation = validateAttachment(file);
    if (validation) throw new Error(validation);
    const extension = file.name.split(".").pop()?.toLowerCase() || "png";
    const storagePath = `${user.id}/${ticketId}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from("support-attachments").upload(storagePath, file, { upsert: false, contentType: file.type });
    if (uploadError) throw uploadError;
    const { error: rowError } = await supabase.from("support_ticket_attachments").insert({
      ticket_id: ticketId, uploaded_by: user.id, file_name: file.name, storage_path: storagePath, mime_type: file.type, size_bytes: file.size,
    });
    if (rowError) {
      await supabase.storage.from("support-attachments").remove([storagePath]);
      throw rowError;
    }
  }

  useEffect(() => {
    void loadTickets(true);
  }, [user?.id, workspaceOwnerId]);

  useEffect(() => {
    if (selectedId) void Promise.all([loadMessages(selectedId), loadAttachments(selectedId)]);
    else { setMessages([]); setAttachments([]); }
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
        user_id: workspaceOwnerId || user.id,
        created_by: user.id,
        subject: form.subject.trim(),
        message: form.message.trim(),
        category: form.category,
        priority: automaticPriority,
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

    if (attachmentFile) {
      try { await uploadAttachment(ticket.id, attachmentFile); }
      catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : "Ticket created, but screenshot upload failed."); }
    }
    setAttachmentFile(null);
    setForm({ subject: "", category: "billing", message: "" });
    setShowCreate(false);
    setNotice("Support ticket created. Our team will reply here.");
    await loadTickets();
    setSelectedId(ticket.id);
    setSaving(false);
  }

  async function submitCsat(rating: "up" | "down") {
    if (!selectedTicket) return;
    const { error: csatError } = await supabase.rpc("submit_ticket_csat", { p_ticket_id: selectedTicket.id, p_rating: rating });
    if (!csatError) {
      setTickets((current) => current.map((t) => (t.id === selectedTicket.id ? { ...t, csat_rating: rating } : t)));
    }
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
      .eq("user_id", workspaceOwnerId || user.id);

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
            <span className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide">{workspaceName || "WORKSPACE"} SUPPORT</span>
            <h1 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight">How can we help?</h1>
            <p className="mt-3 max-w-2xl text-sm sm:text-base text-slate-300">Create a ticket, attach screenshots, track every response and keep your workspace issue history in one secure place.</p>
            <div className={`mt-4 inline-flex rounded-xl border px-4 py-3 ${supportLevel.color}`}><div><p className="text-sm font-bold">{supportLevel.name}</p><p className="mt-0.5 text-xs opacity-90">{supportLevel.detail}</p></div></div>
          </div>
          <button onClick={() => setShowCreate(true)} className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-slate-100 transition shadow-lg">+ Create support ticket</button>
        </div>
      </section>

      {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-5"><p className="text-sm text-slate-500">Open tickets</p><p className="mt-2 text-3xl font-bold text-slate-900">{tickets.filter((t) => t.status === "open").length}</p></div>
        <div className="card p-5"><p className="text-sm text-slate-500">In progress / waiting</p><p className="mt-2 text-3xl font-bold text-slate-900">{tickets.filter((t) => ["in_progress","waiting_customer","pending"].includes(t.status)).length}</p></div>
        <div className="card p-5"><p className="text-sm text-slate-500">Resolved</p><p className="mt-2 text-3xl font-bold text-slate-900">{tickets.filter((t) => t.status === "resolved" || t.status === "closed").length}</p></div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[380px_minmax(0,1fr)] gap-5 min-h-[560px]">
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-slate-200 space-y-3">
            <input className="input" placeholder="Search tickets..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
                <option value="all">All statuses</option><option value="open">Open</option><option value="in_progress">In progress</option><option value="waiting_customer">Waiting for you</option><option value="pending">Pending</option><option value="resolved">Resolved</option><option value="closed">Closed</option>
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
                  <div className="flex flex-wrap gap-2"><span className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${statusStyles[selectedTicket.status]}`}>{selectedTicket.status.replaceAll("_", " ")}</span><span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">{supportSla(selectedTicket)}</span></div>
                </div>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/70 p-5 sm:p-6 min-h-[300px] max-h-[480px]">
                {messages.length === 0 ? <p className="text-center text-sm text-slate-500">No messages yet.</p> : messages.map((item) => {
                  const mine = item.author_type === "customer";
                  return <div key={item.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}><div className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${mine ? "bg-primary-600 text-white rounded-br-md" : "bg-white border border-slate-200 text-slate-800 rounded-bl-md"}`}><div className="mb-1 flex items-center justify-between gap-6"><span className={`text-xs font-semibold ${mine ? "text-primary-100" : "text-slate-500"}`}>{mine ? "You" : "Rivox Support"}</span><span className={`text-[10px] ${mine ? "text-primary-200" : "text-slate-400"}`}>{formatDate(item.created_at)}</span></div><p className="whitespace-pre-wrap text-sm leading-relaxed">{item.message}</p></div></div>;
                })}
              </div>

              {attachments.length > 0 && <div className="border-t border-slate-200 p-4 sm:p-5"><p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Screenshots</p><div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{attachments.map((item) => <a key={item.id} href={item.signed_url} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-xl border border-slate-200 bg-white"><img src={item.signed_url} alt={item.file_name} className="h-28 w-full object-cover group-hover:scale-105 transition"/><p className="truncate p-2 text-xs text-slate-600">{item.file_name}</p></a>)}</div></div>}

              <form onSubmit={sendReply} className="border-t border-slate-200 p-4 sm:p-5">
                {selectedTicket.status === "closed" ? <p className="rounded-xl bg-slate-100 p-3 text-center text-sm text-slate-600">This ticket is closed. Create a new ticket if you need more help.</p> : <div className="flex flex-col sm:flex-row gap-3"><textarea className="input min-h-24 flex-1" placeholder="Write a reply..." value={reply} onChange={(e) => setReply(e.target.value)} /><button disabled={saving || !reply.trim()} className="btn-primary self-end disabled:opacity-50">{saving ? "Sending..." : "Send reply"}</button></div>}
              </form>
              {selectedTicket.resolution_summary && <div className="border-t border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><b>Resolution:</b> {selectedTicket.resolution_summary}</div>}
              {["resolved", "closed"].includes(selectedTicket.status) && (
                selectedTicket.csat_rating
                  ? <div className="border-t border-slate-200 p-4 text-center text-sm text-slate-500">Thanks for your feedback {selectedTicket.csat_rating === "up" ? "👍" : "👎"}</div>
                  : <div className="flex items-center justify-center gap-4 border-t border-slate-200 p-4"><span className="text-sm font-semibold text-slate-600">Was this helpful?</span><button onClick={() => submitCsat("up")} className="rounded-full border border-slate-200 px-3 py-1.5 text-lg hover:bg-slate-50" aria-label="Yes, helpful">👍</button><button onClick={() => submitCsat("down")} className="rounded-full border border-slate-200 px-3 py-1.5 text-lg hover:bg-slate-50" aria-label="Not helpful">👎</button></div>
              )}
            </>
          )}
        </div>
      </section>


      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-600">Contact Support</p>
          <h2 className="mt-2 text-xl font-bold text-slate-900">Need direct help?</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Create a ticket and keep every reply, screenshot and status update together. Your queue is handled automatically according to your Rivox plan.</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary mt-5">Create a new ticket</button>
        </div>
        <div className="card p-5 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-600">Knowledge Base</p>
          <h2 className="mt-2 text-xl font-bold text-slate-900">Quick help topics</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            {['Billing & plans','Team Members','Invoices','Account & login'].map((topic) => <div key={topic} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-semibold text-slate-700">{topic}</div>)}
          </div>
        </div>
      </section>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm" onClick={() => setShowCreate(false)} />
          <form onSubmit={createTicket} className="relative card w-full max-w-xl p-6 sm:p-7 animate-scale-in">
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-primary-600">New support request</p><h2 className="mt-1 text-2xl font-bold text-slate-900">Tell us what happened</h2></div><button type="button" onClick={() => setShowCreate(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">✕</button></div>
            <div className="mt-6 space-y-4">
              <div><label className="label">Subject</label><input required className="input mt-1" placeholder="Example: Invoice balance is not updating" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
              <div><label className="label">Category</label><select className="input mt-1" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}><option value="billing">Billing & plans</option><option value="invoice">Invoice issue</option><option value="account">Account & login</option><option value="bug">Bug report</option><option value="feature">Feature request</option><option value="technical">Technical issue</option><option value="other">Other</option></select></div>
              <div><label className="label">Screenshot (optional)</label><input type="file" accept="image/png,image/jpeg,image/webp" className="input mt-1" onChange={(e) => { const file=e.target.files?.[0] || null; if (file) { const issue=validateAttachment(file); if (issue) { setError(issue); e.currentTarget.value=""; setAttachmentFile(null); } else { setError(""); setAttachmentFile(file); } } else setAttachmentFile(null); }} /><p className="mt-1 text-xs text-slate-500">PNG, JPG or WEBP. Maximum 5 MB.</p></div>
              <div><label className="label">Describe the issue</label><textarea required className="input mt-1 min-h-36" placeholder="Include the steps you took, what you expected and what happened instead." value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></div>
            </div>
            <div className="mt-6 flex justify-end gap-3"><button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button><button disabled={saving} className="btn-primary disabled:opacity-50">{saving ? "Creating..." : "Create ticket"}</button></div>
          </form>
        </div>
      )}
    </div>
  );
}
