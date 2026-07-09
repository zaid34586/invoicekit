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
      setError(signInError || "Invalid staff email or password.");
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
      setError("This account is not an active staff account.");
      setSubmitting(false);
      return;
    }
    navigate("/staff", { replace: true });
  }

  return (
    <div className="min-h-screen bg-slate-950 relative overflow-hidden">
      <div className="absolute inset-0 opacity-40">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-primary-600 blur-3xl" />
        <div className="absolute top-40 -right-28 w-96 h-96 rounded-full bg-blue-600 blur-3xl" />
        <div className="absolute -bottom-40 left-1/3 w-96 h-96 rounded-full bg-purple-600 blur-3xl" />
      </div>
      <div className="relative min-h-screen grid grid-cols-1 lg:grid-cols-2">
        <div className="hidden lg:flex flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white text-slate-950 flex items-center justify-center font-black">IK</div>
            <div>
              <div className="font-black text-xl">InvoiceKit Staff</div>
              <div className="text-sm text-slate-300">Operations workspace</div>
            </div>
          </div>
          <div className="max-w-xl">
            <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold mb-6">Secure staff portal</div>
            <h1 className="text-5xl font-black leading-tight">Manage support, tasks and operations from one clean workspace.</h1>
            <p className="text-slate-300 mt-5 text-lg">Your account access is role-based. You only see the tools assigned by the owner admin.</p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm text-slate-300">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Role based access</div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Task tracking</div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Support workflow</div>
          </div>
        </div>

        <div className="flex items-center justify-center px-4 py-10">
          <div className="w-full max-w-md">
            <div className="lg:hidden text-center mb-8 text-white">
              <div className="w-14 h-14 rounded-2xl bg-white text-slate-950 flex items-center justify-center mx-auto mb-4 font-black">IK</div>
              <h1 className="text-2xl font-black">InvoiceKit Staff</h1>
            </div>

            <form onSubmit={handleSubmit} className="bg-white rounded-[2rem] p-7 sm:p-8 shadow-2xl border border-white/70 space-y-5">
              <div>
                <h2 className="text-2xl font-black text-slate-950">Staff sign in</h2>
                <p className="text-sm text-slate-500 mt-1">Use the work email and temporary password shared by admin.</p>
              </div>
              {error && <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Work email</label>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-950" placeholder="support@invoicekit.com" autoComplete="username" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Password</label>
                <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-950" placeholder="••••••••" autoComplete="current-password" />
              </div>
              <button type="submit" disabled={submitting} className="w-full rounded-2xl bg-slate-950 text-white py-3.5 font-bold hover:bg-slate-800 disabled:opacity-60">
                {submitting ? "Checking access..." : "Sign in to staff portal"}
              </button>
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 text-xs text-slate-500 leading-relaxed">
                Owner admin access is separate. Staff accounts cannot access the owner admin console.
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
