import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

type Faq = { id: string; question: string; answer: string };

export default function KnowledgeBase() {
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from("chat_faqs").select("id,question,answer").order("created_at");
      setFaqs((data as Faq[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return faqs;
    return faqs.filter((f) => f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q));
  }, [faqs, query]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <section className="rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-primary-950 p-6 sm:p-8 text-white">
        <Link to="/support" className="text-xs font-semibold text-slate-300 hover:text-white">&larr; Back to Support</Link>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Knowledge Base</h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-300">Quick answers to common questions. Can't find what you need? Start a live chat or create a ticket.</p>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search articles..."
          className="mt-5 w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-white/30"
        />
      </section>

      <section className="space-y-3">
        {loading && <p className="text-center text-sm text-slate-500">Loading articles...</p>}
        {!loading && filtered.length === 0 && <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No articles match "{query}". Try a different search or <Link to="/support" className="text-primary-600 font-semibold">create a ticket</Link>.</p>}
        {filtered.map((faq) => {
          const open = openId === faq.id;
          return (
            <article key={faq.id} className="card overflow-hidden">
              <button onClick={() => setOpenId(open ? null : faq.id)} className="flex w-full items-center justify-between gap-4 p-5 text-left">
                <h3 className="font-semibold text-slate-900">{faq.question}</h3>
                <span className={`shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`}>▾</span>
              </button>
              {open && <p className="whitespace-pre-wrap border-t border-slate-100 p-5 pt-4 text-sm text-slate-600">{faq.answer}</p>}
            </article>
          );
        })}
      </section>
    </div>
  );
}
