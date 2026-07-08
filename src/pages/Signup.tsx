import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ADMIN_EMAIL } from "../lib/constants";

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
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white">
        <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-6" />
        <p className="text-lg font-semibold text-slate-700">Creating your account...</p>
        <p className="text-sm text-slate-400 mt-2">Please wait a moment</p>
      </div>
    );
  }

  if (stage === "success") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white px-4">
        <div className="flex flex-col items-center text-center max-w-sm w-full">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
            <svg
              className="w-10 h-10 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-slate-900 mb-2">Account Created!</h1>

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
    <div className="min-h-screen flex flex-col bg-slate-50">
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Link to="/" className="inline-flex items-center gap-2">
              <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
                <span className="text-white text-xl font-bold">IK</span>
              </div>
              <span className="text-2xl font-bold text-slate-900">InvoiceKit</span>
            </Link>
          </div>

          <div className="card p-8 animate-fade-in">
            <h1 className="text-2xl font-bold text-slate-900 mb-1">Create your account</h1>
            <p className="text-sm text-slate-500 mb-6">
              Start creating professional invoices in minutes
            </p>

            {error && (
              <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
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
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input"
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                />
              </div>

              <button type="submit" className="btn-primary w-full">
                Create free account
              </button>
            </form>
          </div>

          <p className="text-center text-sm text-slate-500 mt-6">
            Already have an account?{" "}
            <Link to="/login" className="text-primary-600 font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}