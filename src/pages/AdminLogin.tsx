import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { ADMIN_EMAIL } from "../lib/constants";

// Owner-only console login. This route is intentionally hidden from the normal
// product navigation and never creates accounts.
export default function AdminLogin() {
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const cleanEmail = email.trim().toLowerCase();
    const { error: signInError } = await signIn(cleanEmail, password);

    if (signInError) {
      setError("Invalid admin credentials.");
      setSubmitting(false);
      return;
    }

    const { data } = await supabase.auth.getUser();
    const signedInEmail = data.user?.email ?? "";

    if (signedInEmail.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      await supabase.auth.signOut();
      setError("Invalid admin credentials.");
      setSubmitting(false);
      return;
    }

    navigate("/admin", { replace: true });
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050816] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-0 h-96 w-96 rounded-full bg-blue-600/25 blur-3xl" />
        <div className="absolute right-0 top-16 h-[34rem] w-[34rem] rounded-full bg-indigo-600/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.12)_1px,transparent_0)] [background-size:28px_28px] opacity-20" />
      </div>

      <div className="relative grid min-h-screen grid-cols-1 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden flex-col justify-between px-12 py-10 lg:flex xl:px-16">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/15 bg-white text-xl font-black text-slate-950 shadow-2xl shadow-blue-500/20">
              IK
            </div>
            <div>
              <p className="text-lg font-bold tracking-tight">Rivox Admin</p>
              <p className="text-sm text-blue-100/70">Owner operations console</p>
            </div>
          </div>

          <div className="max-w-2xl">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-blue-100 backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.9)]" />
              Secure owner access
            </div>
            <h1 className="text-5xl font-black leading-[1.05] tracking-tight xl:text-6xl">
              Control revenue, users and operations from one premium console.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
              Review business health, manage staff, support customers and protect your Rivox workspace.
            </p>
          </div>

          <div className="grid max-w-2xl grid-cols-3 gap-4">
            {[
              ["Owner only", "Locked console"],
              ["Audit ready", "Every action tracked"],
              ["Team safe", "Staff portal separate"],
            ].map(([title, subtitle]) => (
              <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-xl">
                <p className="text-sm font-bold text-white">{title}</p>
                <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-md">
            <div className="mb-8 text-center lg:hidden">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-xl font-black text-slate-950">
                IK
              </div>
              <h1 className="text-2xl font-black">Rivox Admin</h1>
              <p className="mt-1 text-sm text-slate-400">Owner operations console</p>
            </div>

            <form
              onSubmit={handleSubmit}
              className="rounded-[2rem] border border-white/15 bg-white/[0.08] p-7 shadow-2xl shadow-black/30 backdrop-blur-2xl sm:p-9"
            >
              <div className="mb-7">
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                  <svg className="h-7 w-7 text-blue-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <h2 className="text-3xl font-black tracking-tight">Admin sign in</h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Restricted access for the Rivox owner account only.
                </p>
              </div>

              {error && (
                <div className="mb-5 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-200">
                  {error}
                </div>
              )}

              <div className="space-y-5">
                <div>
                  <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-400">Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-blue-400/70 focus:ring-4 focus:ring-blue-500/20"
                    placeholder="owner@rivox.com"
                    autoComplete="username"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-400">Password</label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-blue-400/70 focus:ring-4 focus:ring-blue-500/20"
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-2xl bg-white px-5 py-4 text-sm font-black text-slate-950 shadow-xl shadow-blue-950/30 transition hover:-translate-y-0.5 hover:bg-blue-50 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "Verifying owner access..." : "Sign in to admin console"}
                </button>
              </div>

              <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-xs leading-5 text-slate-400">
                Staff accounts must use the staff portal. Customer accounts cannot access this console.
              </div>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
