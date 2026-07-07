import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { ADMIN_EMAIL } from "../lib/constants";

// This page is intentionally NOT linked from anywhere in the normal app
// (no nav item, no button, nothing on the landing/login pages). It only
// exists at this exact URL. There is no sign-up here on purpose — the
// admin account is a single, fixed account created once by the owner
// directly in Supabase; this page only ever signs in, never creates one.
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

    const { error: signInError } = await signIn(email, password);

    if (signInError) {
      // Same generic message whether the email/password was wrong or the
      // account simply isn't the admin account — never confirm/deny which.
      setError("Invalid admin credentials.");
      setSubmitting(false);
      return;
    }

    // signIn() only starts a Supabase session — it does not know about
    // ADMIN_EMAIL. Verify directly against the session that was actually
    // created before granting access to anything.
    const { data } = await supabase.auth.getUser();
    const signedInEmail = data.user?.email ?? "";

    if (signedInEmail.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      // A real (non-admin) account may have just been signed into by
      // mistake — sign it back out rather than leaving that session active
      // on the admin login page.
      await supabase.auth.signOut();
      setError("Invalid admin credentials.");
      setSubmitting(false);
      return;
    }

    navigate("/admin", { replace: true });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-slate-700 rounded-lg flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-white">Admin Sign In</h1>
          <p className="text-sm text-slate-400 mt-1">Restricted — owner access only</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-slate-800 rounded-xl p-6 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-500"
              placeholder="admin@invoicekit.app"
              autoComplete="username"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-500"
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-slate-100 text-slate-900 font-semibold rounded-lg py-2.5 hover:bg-white transition disabled:opacity-50"
          >
            {submitting ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
