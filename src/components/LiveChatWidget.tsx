import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { processMessage, type ChatContext, type AIResponse } from "../lib/aiEngine";
import { getGreeting, getQuickReplies, type QuickReply } from "../lib/aiKnowledge";

type ChatMessage = {
  id: string;
  ticket_id: string;
  author_type: "customer" | "staff" | "admin" | "bot";
  message: string;
  created_at: string;
};

export default function LiveChatWidget() {
  const { user, workspaceOwnerId, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [started, setStarted] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const aiMessageCount = useRef(0);

  const userPlan = profile?.plan || "free";
  const isGuest = !user;

  useEffect(() => {
    if (!open || loaded) return;
    void loadOrPrepareSession();
  }, [open, loaded]);

  useEffect(() => {
    if (!ticketId) return;
    const channel = supabase
      .channel(`live-chat-${ticketId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_ticket_messages", filter: `ticket_id=eq.${ticketId}` },
        (payload) => {
          const msg = payload.new as ChatMessage;
          if (msg.author_type !== "customer") {
            setMessages((current) => [...current, msg]);
          }
        }
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [ticketId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, aiThinking]);

  // Show AI greeting when chat opens
  useEffect(() => {
    if (open && started && messages.length === 0 && !loaded) {
      const greeting = getGreeting(userPlan, true);
      const botMsg: ChatMessage = {
        id: "ai-greeting",
        ticket_id: "ai",
        author_type: "bot",
        message: greeting,
        created_at: new Date().toISOString(),
      };
      setMessages([botMsg]);
      setQuickReplies(getQuickReplies(userPlan));
      setLoaded(true);
    }
  }, [open, started, messages.length, loaded, userPlan]);

  async function loadOrPrepareSession() {
    if (isGuest) {
      setLoaded(true);
      return;
    }
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
    } else {
      const greeting = getGreeting(userPlan, true);
      const botMsg: ChatMessage = {
        id: "ai-greeting",
        ticket_id: "ai",
        author_type: "bot",
        message: greeting,
        created_at: new Date().toISOString(),
      };
      setMessages([botMsg]);
      setQuickReplies(getQuickReplies(userPlan));
    }
  }

  function startGuestChat() {
    if (!name.trim() || !email.trim()) return;
    setStarted(true);
  }

  const handleAIResponse = useCallback((userMessage: string) => {
    setAiThinking(true);
    setQuickReplies([]);

    setTimeout(() => {
      const context: ChatContext = {
        userPlan,
        isFirstTime: aiMessageCount.current === 0,
        previousMessages: messages.map(m => ({
          role: m.author_type === "customer" ? "user" : "bot",
          content: m.message,
        })),
      };

      const response: AIResponse = processMessage(userMessage, context);

      const botMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        ticket_id: "ai",
        author_type: "bot",
        message: response.message,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, botMsg]);
      setQuickReplies(response.quickReplies);
      setAiThinking(false);
      aiMessageCount.current++;

      if (response.shouldEscalate) {
        // Create a real ticket for escalation
        void createEscalationTicket(userMessage);
      }
    }, 800 + Math.random() * 700); // Simulate AI thinking time
  }, [userPlan, messages]);

  async function createEscalationTicket(message: string) {
    if (isGuest && !user) return;
    const ownerId = workspaceOwnerId || user?.id;
    const { data: ticket } = await supabase
      .from("admin_support_tickets")
      .insert({
        user_id: ownerId || "00000000-0000-0000-0000-000000000000",
        created_by: user?.id || "00000000-0000-0000-0000-000000000000",
        subject: "Live chat - Escalated to human",
        message: message,
        category: "general",
        priority: "high",
        status: "open",
        origin: "chat",
        last_reply_at: new Date().toISOString(),
        guest_name: isGuest ? name : undefined,
        guest_email: isGuest ? email : undefined,
      })
      .select("id")
      .single();

    if (ticket) {
      setTicketId(ticket.id);
    }
  }

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft("");

    // Add user message to UI immediately
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      ticket_id: ticketId || "ai",
      author_type: "customer",
      message: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // Check if user wants to talk to human
    const lowerText = text.toLowerCase();
    const wantsHuman = /speak to human|talk to agent|real person|human support|connect.*agent/i.test(lowerText);

    if (wantsHuman && !ticketId) {
      setAiThinking(true);
      setTimeout(() => {
        const botMsg: ChatMessage = {
          id: `ai-${Date.now()}`,
          ticket_id: "ai",
          author_type: "bot",
          message: "Of course! Let me connect you with a support agent. They'll be with you shortly. In the meantime, you can describe your issue in detail.",
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, botMsg]);
        setAiThinking(false);
        void createEscalationTicket(text);
      }, 800);
      setSending(false);
      return;
    }

    // If we have a real ticket, save to database
    if (ticketId) {
      let currentTicketId = ticketId;
      const { data: inserted } = await supabase
        .from("support_ticket_messages")
        .insert({
          ticket_id: currentTicketId,
          author_user_id: user?.id || "00000000-0000-0000-0000-000000000000",
          author_type: "customer",
          message: text,
          is_internal: false,
        })
        .select("id, ticket_id, author_type, message, created_at")
        .single();

      if (inserted) {
        // Don't add to messages - Realtime will handle it
      }
    }

    setSending(false);

    // Get AI response
    handleAIResponse(text);
  }

  function handleQuickReply(message: string) {
    setDraft("");
    // Add user message
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      ticket_id: ticketId || "ai",
      author_type: "customer",
      message: message,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    handleAIResponse(message);
  }

  function getMessageStyle(authorType: string) {
    switch (authorType) {
      case "customer":
        return "ml-auto bg-indigo-600 text-white";
      case "bot":
        return "bg-gradient-to-br from-slate-100 to-slate-50 border border-slate-200 text-slate-700";
      case "staff":
      case "admin":
        return "bg-emerald-50 border border-emerald-200 text-emerald-800";
      default:
        return "bg-white border border-slate-200 text-slate-800";
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open && (
        <div className="mb-3 flex h-[520px] w-[360px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-sm">🤖</div>
              <div>
                <p className="text-sm font-black">Rivox Assistant</p>
                <p className="text-[11px] text-indigo-100">
                  {aiThinking ? "Thinking..." : "Online • Instant replies"}
                </p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close chat" className="rounded-full p-1 hover:bg-white/10">✕</button>
          </div>

          {/* Guest Form */}
          {!user && !started ? (
            <div className="flex-1 flex flex-col justify-center p-5 bg-gradient-to-b from-slate-50 to-white">
              <div className="text-center mb-5">
                <div className="h-16 w-16 rounded-full bg-indigo-100 flex items-center justify-center mx-auto mb-3 text-3xl">💬</div>
                <p className="text-base font-bold text-slate-900">Chat with us</p>
                <p className="text-sm text-slate-500 mt-1">No account needed • Instant AI replies</p>
              </div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="mb-2 rounded-xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300"
              />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Your email"
                type="email"
                className="mb-4 rounded-xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300"
              />
              <button
                onClick={startGuestChat}
                disabled={!name.trim() || !email.trim()}
                className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50 transition hover:shadow-lg"
              >
                Start Chat →
              </button>
            </div>
          ) : (
            <>
              {/* Messages */}
              <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50/50 p-4">
                {messages.length === 0 && (
                  <div className="text-center mt-8">
                    <div className="h-12 w-12 rounded-full bg-indigo-100 flex items-center justify-center mx-auto mb-3 text-2xl">🤖</div>
                    <p className="text-sm text-slate-500">Send a message to start the conversation.</p>
                  </div>
                )}

                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${getMessageStyle(message.author_type)}`}
                  >
                    <div className="whitespace-pre-wrap">{message.message}</div>
                    {message.author_type === "bot" && (
                      <div className="mt-1 text-[10px] opacity-50">Rivox AI</div>
                    )}
                  </div>
                ))}

                {/* AI Typing Indicator */}
                {aiThinking && (
                  <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-gradient-to-br from-slate-100 to-slate-50 border border-slate-200">
                    <div className="flex items-center gap-1">
                      <div className="h-2 w-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <div className="h-2 w-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                      <div className="h-2 w-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                )}

                {/* Quick Replies */}
                {quickReplies.length > 0 && !aiThinking && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {quickReplies.slice(0, 4).map((qr) => (
                      <button
                        key={qr.id}
                        onClick={() => handleQuickReply(qr.message)}
                        className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 hover:border-indigo-300"
                      >
                        {qr.icon && <span className="mr-1">{qr.icon}</span>}
                        {qr.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Input */}
              <form onSubmit={sendMessage} className="flex items-center gap-2 border-t border-slate-200 p-3 bg-white">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 rounded-full border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300"
                  disabled={aiThinking}
                />
                <button
                  disabled={sending || !draft.trim() || aiThinking}
                  className="rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 transition hover:shadow-lg"
                >
                  {aiThinking ? "..." : "→"}
                </button>
              </form>
            </>
          )}
        </div>
      )}

      {/* Toggle Button */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Toggle live chat"
        className={`flex h-14 w-14 items-center justify-center rounded-full shadow-xl transition-all ${
          open
            ? "bg-slate-600 hover:bg-slate-700"
            : "bg-gradient-to-r from-indigo-600 to-purple-600 hover:scale-110 hover:shadow-2xl"
        } text-white`}
      >
        {open ? (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        )}
      </button>
    </div>
  );
}
