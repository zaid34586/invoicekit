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

    if (profile?.phone_verified === true) {
      setLoadingText("Taking you to dashboard...");
      navigate("/dashboard", { replace: true });
    } else {
      navigate("/verify-phone", { replace: true });
    }
  }

  if (stage === "loading") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white">
        <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-6" />
        <p className="text-lg font-semibold text-slate-700">{loadingText}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Link to="/" className="inline-flex items-center gap-2">
              <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
                <span className="text-white text-xl font-bold">IK</span>
              </div>
              <span className="text-2xl font-bold text-slate-900">
                Rivox
              </span>
            </Link>
          </div>

          <div className="card p-8 animate-fade-in">
            <h1 className="text-2xl font-bold text-slate-900 mb-1">
              Welcome back
            </h1>
            <p className="text-sm text-slate-500 mb-6">
              Sign in to your account to continue
            </p>

            {emailConfirmed && (
              <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
                Email verified successfully. Please sign in.
              </div>
            )}

            {error && (
              <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
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
                  className="input"
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
                  className="input"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                />
              </div>

              <button type="submit" className="btn-primary w-full">
                Sign in
              </button>
            </form>
          </div>

          <p className="text-center text-sm text-slate-500 mt-6">
            Don't have an account?{" "}
            <Link
              to="/signup"
              className="text-primary-600 font-medium hover:underline"
            >
              Sign up free
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}