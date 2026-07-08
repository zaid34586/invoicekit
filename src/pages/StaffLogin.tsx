import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

export default function StaffLogin() {
  const { signIn, signOut } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const normalizedEmail = email.trim().toLowerCase();
    const { error: signInError } = await signIn(normalizedEmail, password, { skipProfile: true });

    if (signInError) {
      setError("Invalid staff credentials.");
      setSubmitting(false);
      return;
    }

    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;

    if (!user) {
      setError("Unable to verify staff session.");
      setSubmitting(false);
      return;
    }

    const { data: staff, error: staffError } = await supabase
      .from("admin_team_members")
      .select("id, role, status")
      .or(`auth_user_id.eq.${user.id},email.eq.${normalizedEmail}`)
      .maybeSingle();

    if (staffError || !staff || staff.status !== "active") {
      await signOut();
      setError("Staff account is not active or not authorized.");
      setSubmitting(false);
      return;
    }

    navigate("/staff", { replace: true });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-700">
            <span className="text-2xl">👨‍💼</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Staff Sign In</h1>
          <p className="text-sm text-slate-400 mt-2">Team workspace for support, finance and operations</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-xl">
          {error && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-2">Staff Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl bg-slate-950 border border-slate-700 px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="support@company.com"
              autoComplete="username"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-2">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl bg-slate-950 border border-slate-700 px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-primary-600 text-white font-semibold rounded-xl py-3 hover:bg-primary-700 transition disabled:opacity-60"
          >
            {submitting ? "Checking access..." : "Sign In to Staff Portal"}
          </button>
        </form>

        <p className="text-center text-xs text-slate-500 mt-5">
          Owner admin login is separate at /admin/login
        </p>
      </div>
    </div>
  );
}
