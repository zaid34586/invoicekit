import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

// Phase 4 (part 1): Live chat widget for customers.
//
// A chat session is just an admin_support_tickets row with origin="chat" --
// this reuses auto-assignment, staff notifications, and SLA tracking that
// already exist for regular tickets instead of building a parallel system.

type ChatMessage = {
  id: string;
  ticket_id: string;
  author_type: "customer" | "staff" | "admin" | "bot";
  message: string;
  created_at: string;
};

export default function LiveChatWidget() {
  const { user, workspaceOwnerId } = useAuth();
  const [open, setOpen] = useState(false);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !user || loaded) return;
    void loadOrPrepareSession();
  }, [open, user]);

  useEffect(() => {
    if (!ticketId) return;
    const channel = supabase
      .channel(`live-chat-${ticketId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_ticket_messages", filter: `ticket_id=eq.${ticketId}` },
        (payload) => setMessages((current) => [...current, payload.new as ChatMessage])
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [ticketId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function loadOrPrepareSession() {
    if (!user) return;
    setLoaded(true);
    const ownerId = workspaceOwnerId || user.id;
    const { data: existing } = await supabase
      .from("admin_support_tickets")
      .select("id")
      .eq("user_id", ownerId)
      .eq("origin", "chat")
      .not("status", "in", '("resolved","closed")')
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      setTicketId(existing.id);
      const { data: existingMessages } = await supabase
        .from("support_ticket_messages")
        .select("id, ticket_id, author_type, message, created_at")
        .eq("ticket_id", existing.id)
        .eq("is_internal", false)
        .order("created_at", { ascending: true });
      setMessages((existingMessages as ChatMessage[]) ?? []);
    }
  }

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !user || sending) return;
    setSending(true);
    setDraft("");

    let currentTicketId = ticketId;
    if (!currentTicketId) {
      const ownerId = workspaceOwnerId || user.id;
      const { data: ticket, error: ticketError } = await supabase
        .from("admin_support_tickets")
        .insert({
          user_id: ownerId,
          created_by: user.id,
          subject: "Live chat",
          message: text,
          category: "general",
          priority: "medium",
          status: "open",
          origin: "chat",
          last_reply_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (ticketError || !ticket) { setSending(false); return; }
      currentTicketId = ticket.id;
      setTicketId(ticket.id);
    }

    const { data: inserted } = await supabase
      .from("support_ticket_messages")
      .insert({ ticket_id: currentTicketId, author_user_id: user.id, author_type: "customer", message: text, is_internal: false })
      .select("id, ticket_id, author_type, message, created_at")
      .single();

    if (inserted) setMessages((current) => [...current, inserted as ChatMessage]);
    setSending(false);

    // Safety net: the bot's FAQ/escalation reply is inserted by a DB trigger
    // as part of the same transaction as the customer's message, so it's
    // already committed by now — refetch shortly after in case the realtime
    // push was missed (e.g. a brief reconnect), so the bot's answer never
    // silently fails to appear.
    const ticketIdForRefetch = currentTicketId;
    window.setTimeout(() => {
      void supabase
        .from("support_ticket_messages")
        .select("id, ticket_id, author_type, message, created_at")
        .eq("ticket_id", ticketIdForRefetch)
        .eq("is_internal", false)
        .order("created_at", { ascending: true })
        .then(({ data }) => { if (data) setMessages(data as ChatMessage[]); });
    }, 1200);
  }

  if (!user) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open && (
        <div className="mb-3 flex h-[480px] w-[340px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl animate-fade-in">
          <div className="flex items-center justify-between bg-indigo-600 px-4 py-3 text-white">
            <div>
              <p className="text-sm font-black">Chat with us</p>
              <p className="text-[11px] text-indigo-100">We usually reply within minutes</p>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close chat" className="rounded-full p-1 hover:bg-white/10">✕</button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-slate-50 p-3">
            {messages.length === 0 && (
              <p className="mt-6 text-center text-xs text-slate-400">Send a message to start the conversation.</p>
            )}
            {messages.map((message) => (
              <div
                key={message.id}
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  message.author_type === "customer"
                    ? "ml-auto bg-indigo-600 text-white"
                    : message.author_type === "bot"
                    ? "bg-slate-200 text-slate-600 italic"
                    : "bg-white border border-slate-200 text-slate-800"
                }`}
              >
                {message.message}
              </div>
            ))}
          </div>

          <form onSubmit={sendMessage} className="flex items-center gap-2 border-t border-slate-200 p-3">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
            <button
              disabled={sending || !draft.trim()}
              className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Toggle live chat"
        className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-xl transition hover:scale-105"
      >
        {open ? "✕" : "💬"}
      </button>
    </div>
  );
}
