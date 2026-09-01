import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

export default function CheckEmail() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
const location = useLocation();

const email =
  location.state?.email ||
  user?.email ||
  "your email address";

const [seconds, setSeconds] = useState(60);
const [sending, setSending] = useState(false);
const [message, setMessage] = useState("");
const [error, setError] = useState("");

  async function handleSignOut() {
    await signOut();
    navigate("/signup");
  }
  async function resendVerification() {
    if (!email || email === "your email address") return;
    setSending(true); setMessage(""); setError("");
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/login?confirmed=1` },
    });
    setSending(false);
    if (resendError) { setError(resendError.message); return; }
    setMessage("A new Rivox verification email has been sent.");
    setSeconds(60);
  }
useEffect(() => {
  if (seconds === 0) return;

  const timer = setTimeout(() => {
    setSeconds((s) => s - 1);
  }, 1000);

  return () => clearTimeout(timer);
}, [seconds]);
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="card p-8 max-w-md w-full text-center animate-fade-in">
        <div className="w-20 h-20 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
          <svg
            className="w-7 h-7 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-slate-900 mb-2">
          Verify your email
        </h1>

        <p className="text-sm text-slate-500 mb-2">We've sent a verification link to</p>
        <p className="text-sm font-semibold text-slate-800 mb-6">
          {email}
        </p>

        {message && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>}
        {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <div className="rounded-xl bg-slate-100 p-4 mb-6">
            <div className="rounded-lg bg-slate-100 py-3 text-sm text-slate-600 mb-3">
  Didn't receive the email?

  <div className="mt-2 font-semibold">
    {seconds > 0 ? (
      <>Resend available in {seconds}s</>
    ) : (
      <button
        className="text-primary-600 hover:underline"
        disabled={sending}
        onClick={resendVerification}
      >
        {sending ? "Sending…" : "Resend verification email"}
      </button>
    )}
  </div>
</div>
          Click the link in the email, then return to Rivox and sign in.
        </div>

        <a
  href="https://mail.google.com"
  target="_blank"
  rel="noreferrer"
  className="btn-secondary w-full mb-3"
>
  Open Gmail
</a>

<button
  onClick={() => navigate("/login?confirmed=1")}
  className="btn-primary w-full mb-3"
>
  I've Verified My Email
</button>

        <button
          onClick={handleSignOut}
          className="btn-secondary w-full text-sm"
        >
          Use a different email
        </button>
      </div>
    </div>
  );
}
