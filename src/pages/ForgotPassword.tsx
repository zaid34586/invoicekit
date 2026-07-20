import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError("");
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: `${window.location.origin}/reset-password` });
    setLoading(false);
    if (resetError) setError(resetError.message); else setSent(true);
  }

  return <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950 px-4 py-10 grid place-items-center"><div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl"><div className="flex items-center gap-3"><img src="/rivox-logo.svg" className="h-11 w-11 rounded-xl" alt="Rivox"/><div><p className="text-xl font-black">Rivox</p><p className="text-xs font-bold uppercase tracking-widest text-violet-600">Account recovery</p></div></div>{sent?<div className="mt-8"><div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-800"><p className="font-black">Check your email</p><p className="mt-2 text-sm leading-6">If an account exists for this address, a secure Rivox password-reset link has been sent.</p></div><Link className="btn-primary mt-6 w-full" to="/login">Return to sign in</Link></div>:<form className="mt-8 space-y-5" onSubmit={submit}><div><h1 className="text-3xl font-black">Forgot password?</h1><p className="mt-2 text-sm leading-6 text-slate-500">Enter your account email and we will send a secure recovery link.</p></div>{error&&<div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}<label className="block"><span className="label">Email address</span><input className="input h-12" required type="email" autoComplete="email" value={email} onChange={(event)=>setEmail(event.target.value)} placeholder="you@business.com"/></label><button className="btn-primary h-12 w-full" disabled={loading}>{loading?"Sending…":"Send recovery link"}</button><Link className="block text-center text-sm font-bold text-violet-600" to="/login">Back to sign in</Link></form>}</div></div>;
}
