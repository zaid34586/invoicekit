import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

type Stage = "form" | "loading";

export default function Login() {
  const { signIn, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const emailConfirmed =
    new URLSearchParams(location.search).get("confirmed") === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("form");
  const [loadingText, setLoadingText] = useState("Signing you in...");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setStage("loading");
    setLoadingText("Signing you in...");

    const { error } = await signIn(email.trim().toLowerCase(), password);

    if (error) {
      setStage("form");
      setError(error);
      return;
    }

    
    const profile = await refreshProfile();

    if (!profile?.country) {
      setLoadingText("Setting up your business...");
      navigate("/business-setup", { replace: true });
    } else if (profile.phone_verified === true) {
      setLoadingText("Taking you to dashboard...");
      navigate("/dashboard", { replace: true });
    } else {
      navigate("/verify-phone", { replace: true });
    }
  }

  if (stage === "loading") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950">
        <div className="w-14 h-14 border-4 border-violet-400/30 border-t-violet-400 rounded-full animate-spin mb-6" />
        <p className="text-lg font-semibold text-white">{loadingText}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950 px-4 py-10 flex items-center justify-center">
      {emailConfirmed && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4 animate-fade-in">
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 px-5 py-4 shadow-2xl shadow-emerald-900/20">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-emerald-800">Email verified successfully!</p>
              <p className="text-xs text-emerald-700">Please sign in below to continue.</p>
            </div>
          </div>
        </div>
      )}

      <div className="w-full max-w-5xl grid lg:grid-cols-[1.05fr_.95fr] overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl shadow-violet-950/30">
        <section className="hidden lg:flex flex-col justify-between p-10 text-white bg-[radial-gradient(circle_at_top_left,_rgba(139,92,246,.42),_transparent_42%),linear-gradient(145deg,#0f172a,#111827)]">
          <div>
            <div className="inline-flex items-center gap-3">
              <img src="/rivox-logo.svg" alt="Rivox" className="h-10 w-10 rounded-xl" />
              <span className="text-2xl font-bold tracking-tight">Rivox</span>
            </div>
            <div className="mt-16 max-w-md">
              <p className="text-sm font-semibold uppercase tracking-[.24em] text-violet-300">Welcome back</p>
              <h1 className="mt-4 text-4xl font-bold leading-tight">Pick up right where you left off.</h1>
              <p className="mt-5 text-base leading-7 text-slate-300">Sign in to manage invoices, clients, subscriptions and revenue from your Rivox workspace.</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs text-slate-300">
            {["Secure by default", "Global currencies", "Always in sync"].map((item) => (
              <div key={item} className="rounded-xl border border-white/10 bg-white/5 p-3">{item}</div>
            ))}
          </div>
        </section>

        <section className="p-6 sm:p-10 lg:p-12 flex flex-col justify-center">
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-slate-950">Welcome back</h2>
            <p className="mt-2 text-sm text-slate-500">Sign in to your account to continue.</p>
          </div>

          {error && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
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
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input h-12"
                placeholder="Enter your password"
                autoComplete="current-password"
              />
            </div>

            <button type="submit" className="btn-primary h-12 w-full justify-center text-base">
              Sign in
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-6">
            Don't have an account?{" "}
            <Link
              to="/signup"
              className="text-violet-600 font-medium hover:underline"
            >
              Sign up free
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}