import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Run = { id: string; status: string; score: number; passed_checks: number; total_checks: number; duration_ms: number | null; summary: string | null; created_at: string; completed_at: string | null };
type Result = { id: string; run_id: string; area: string; check_name: string; status: "pass" | "warning" | "fail"; latency_ms: number | null; detail: string | null };

export default function AdminProductionQA() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [selected, setSelected] = useState("");
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async (preferred?: string) => {
    const { data, error } = await supabase.from("admin_qa_runs").select("*").order("created_at", { ascending: false }).limit(30);
    if (error) { setMessage(error.message); return; }
    const rows = (data || []) as Run[];
    setRuns(rows);
    const id = preferred || selected || rows[0]?.id || "";
    setSelected(id);
    if (id) {
      const { data: checkRows } = await supabase.from("admin_qa_check_results").select("*").eq("run_id", id).order("area");
      setResults((checkRows || []) as Result[]);
    }
  }, [selected]);

  useEffect(() => { void load(); }, []);

  const runQA = async () => {
    setRunning(true); setMessage("");
    const { data, error } = await supabase.functions.invoke("production-qa", { body: { trigger_source: "manual" } });
    if (error || !data?.ok) setMessage(data?.error || error?.message || "Production QA failed to run.");
    else {
      setMessage(`Production QA complete: ${data.score}% · ${data.passed}/${data.total} passed`);
      await load(data.run_id);
    }
    setRunning(false);
  };

  const latest = runs[0];
  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-gradient-to-br from-slate-950 via-blue-950 to-cyan-950 p-6 text-white shadow-xl">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">Release confidence</p><h1 className="mt-2 text-3xl font-black">Automated Production QA</h1><p className="mt-2 text-sm text-slate-300">Real route, Auth, database, Storage and billing checks before and after every release.</p></div><button onClick={() => void runQA()} disabled={running} className="rounded-xl bg-white px-5 py-3 text-sm font-black text-slate-950 disabled:opacity-60">{running ? "Testing production..." : "Run production QA"}</button></div>
      </div>
      {message && <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-800">{message}</div>}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[["Release score", latest ? `${latest.score}%` : "Not run", "🎯"], ["Passed", latest ? `${latest.passed_checks}/${latest.total_checks}` : "—", "✅"], ["Failed", latest ? String(latest.total_checks - latest.passed_checks) : "—", "❌"], ["Duration", latest?.duration_ms ? `${(latest.duration_ms / 1000).toFixed(1)}s` : "—", "⏱️"]].map(([label, value, icon]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-2xl">{icon}</p><p className="mt-3 text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-1 text-2xl font-black text-slate-950">{value}</p></div>)}
      </div>
      <div className="grid gap-6 xl:grid-cols-[300px_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-4"><h2 className="font-black text-slate-950">Run history</h2></div><div className="divide-y divide-slate-100">{runs.length === 0 ? <p className="p-6 text-sm text-slate-500">No QA runs yet.</p> : runs.map((run) => <button key={run.id} onClick={() => { setSelected(run.id); void load(run.id); }} className={`w-full p-4 text-left ${selected === run.id ? "bg-cyan-50" : "hover:bg-slate-50"}`}><div className="flex items-center justify-between"><span className="font-bold text-slate-900">{run.score}%</span><span className={`rounded-full px-2 py-1 text-xs font-bold ${run.status === "passed" ? "bg-emerald-100 text-emerald-700" : run.status === "failed" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{run.status}</span></div><p className="mt-1 text-xs text-slate-500">{new Date(run.created_at).toLocaleString()}</p></button>)}</div></div>
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-5"><h2 className="text-lg font-black text-slate-950">Check results</h2></div>{results.length === 0 ? <p className="p-10 text-center text-sm text-slate-500">Run production QA to generate verified results.</p> : <div className="divide-y divide-slate-100">{results.map((result) => <div key={result.id} className="flex flex-col gap-2 p-4 lg:flex-row lg:items-center lg:justify-between"><div><p className="font-bold text-slate-900">{result.check_name}</p><p className="text-sm text-slate-500">{result.area} · {result.detail}</p></div><div className="flex items-center gap-3"><span className="text-xs text-slate-500">{result.latency_ms ?? 0} ms</span><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${result.status === "pass" ? "bg-emerald-100 text-emerald-700" : result.status === "fail" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{result.status}</span></div></div>)}</div>}</div>
      </div>
    </div>
  );
}
