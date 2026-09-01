import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ADMIN_EMAIL } from "../lib/constants";
import PasswordField from "../components/PasswordField";

type Stage = "form" | "loading" | "success";

export default function Signup() {
  const { signUp } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("form");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    // The admin account is reserved and must only ever be created directly
    // in Supabase by the owner — never through this public signup form.
    // (Real enforcement is Supabase's unique-email constraint once that
    // account exists; this is just a clear, early error instead of a
    // confusing "already registered" message.)
    const cleanEmail = email.trim().toLowerCase();

    if (cleanEmail === ADMIN_EMAIL.toLowerCase()) {
      setError("This email address is reserved and cannot be used to sign up.");
      return;
    }

    setStage("loading");

    const result = await signUp(cleanEmail, password);

    if (result.error) {
      setStage("form");
      setError(result.error);
      return;
    }

    setStage("success");
  }

  if (stage === "loading") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950">
        <div className="w-14 h-14 border-4 border-violet-400/30 border-t-violet-400 rounded-full animate-spin mb-6" />
        <p className="text-lg font-semibold text-white">Creating your account...</p>
        <p className="text-sm text-slate-400 mt-2">Please wait a moment</p>
      </div>
    );
  }

  if (stage === "success") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950 px-4">
        <div className="flex flex-col items-center text-center max-w-sm w-full rounded-3xl border border-white/10 bg-white p-8 shadow-2xl shadow-violet-950/30">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
            <svg
              className="w-10 h-10 text-emerald-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-slate-950 mb-2">Account Created!</h1>

          <p className="text-slate-500 text-sm mb-1">We sent a confirmation link to</p>

          <p className="font-semibold text-slate-800 mb-8">{email}</p>

          <a
            href="https://mail.google.com"
            target="_blank"
            rel="noreferrer"
            className="btn-primary w-full text-center mb-3 block"
          >
            Open Gmail
          </a>

          <button
            type="button"
            onClick={() => navigate("/login")}
            className="btn-secondary w-full"
          >
            I have verified my email
          </button>

          <p className="text-xs text-slate-400 mt-6">
            Cannot find the email? Check your spam folder.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-shell">
        <section className="auth-aside">
          <div>
            <div className="inline-flex items-center gap-3">
              <img src="/rivox-logo.svg" alt="Rivox" className="h-10 w-10 rounded-xl" />
              <span className="text-2xl font-bold tracking-tight">Rivox</span>
            </div>
            <div className="mt-16 max-w-md">
              <p className="text-sm font-semibold uppercase tracking-[.24em] text-violet-300">Get started</p>
              <h1 className="mt-4 text-4xl font-bold leading-tight">Run your business. Get paid faster.</h1>
              <p className="mt-5 text-base leading-7 text-slate-300">Create polished invoices, manage clients, track revenue and subscriptions — all from one premium workspace.</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs text-slate-300">
            {["Free to start", "No card required", "Cancel anytime"].map((item) => (
              <div key={item} className="rounded-xl border border-white/10 bg-white/5 p-3">{item}</div>
            ))}
          </div>
        </section>

        <section className="auth-content flex flex-col justify-center">
          <div className="mb-8">
            <h2 className="auth-heading font-bold text-slate-950">Create your account</h2>
            <p className="mt-2 text-sm text-slate-500">Start creating professional invoices in minutes.</p>
          </div>

          {error && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
              {error.includes("already registered") && (
                <span>
                  {" "}
                  <Link to="/login" className="underline font-medium">
                    Sign in here
                  </Link>
                </span>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="label" htmlFor="email">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input h-12"
                placeholder="you@business.com"
                autoComplete="email"
              />
            </div>

            <div>
              <label className="label" htmlFor="password">
                Password
              </label>
              <PasswordField
                id="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
            </div>

            <button type="submit" className="btn-primary h-12 w-full justify-center text-base">
              Create free account
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-6">
            Already have an account?{" "}
            <Link to="/login" className="text-violet-600 font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}