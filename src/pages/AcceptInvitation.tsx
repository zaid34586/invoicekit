import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

type Invitation = {
  email: string;
  name: string | null;
  role: "manager" | "accountant" | "staff";
  workspace_name: string;
  invited_by_name: string;
  expires_at: string;
};

const rules = [
  { label: "At least 8 characters", test: (value: string) => value.length >= 8 },
  { label: "One uppercase letter", test: (value: string) => /[A-Z]/.test(value) },
  { label: "One lowercase letter", test: (value: string) => /[a-z]/.test(value) },
  { label: "One number", test: (value: string) => /\d/.test(value) },
  { label: "One special character", test: (value: string) => /[^A-Za-z0-9]/.test(value) },
];

export default function AcceptInvitation() {
  const navigate = useNavigate();
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  const passed = useMemo(() => rules.filter((rule) => rule.test(password)).length, [password]);
  const passwordIsValid = passed === rules.length;

  useEffect(() => {
    let active = true;
    async function loadInvitation() {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!active) return;
      if (!session) {
        setError("This invitation link is invalid or has expired. Ask the workspace owner to send a new invitation.");
        setLoading(false);
        return;
      }
      const { data, error: invitationError } = await supabase.rpc("get_my_pending_workspace_invitation");
      if (!active) return;
      if (invitationError || !data?.valid) {
        setError(data?.error || invitationError?.message || "This invitation is no longer valid.");
      } else {
        setInvitation(data as Invitation & { valid: true });
      }
      setLoading(false);
    }
    void loadInvitation();
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!passwordIsValid) return setError("Please meet all password requirements.");
    if (password !== confirmPassword) return setError("Passwords do not match.");
    setSaving(true);
    const { error: passwordError } = await supabase.auth.updateUser({ password });
    if (passwordError) {
      setError(passwordError.message);
      setSaving(false);
      return;
    }
    const { data, error: claimError } = await supabase.rpc("claim_workspace_invitation");
    if (claimError || !data?.claimed) {
      setError(claimError?.message || "The invitation could not be accepted. Please request a new invitation.");
      setSaving(false);
      return;
    }
    setReady(true);
    setSaving(false);
  }

  if (loading) return <div className="min-h-screen grid place-items-center bg-slate-950 text-white"><p className="font-semibold">Checking your invitation...</p></div>;

  return <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950 px-4 py-10 grid place-items-center">
    <section className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl">
      <header className="bg-gradient-to-r from-violet-700 to-indigo-700 p-7 text-white">
        <div className="flex items-center gap-3"><img src="/rivox-logo.svg" className="h-11 w-11 rounded-xl" alt="Rivox"/><div><p className="text-2xl font-black">Rivox</p><p className="text-sm text-violet-100">Workspace invitation</p></div></div>
      </header>
      <div className="p-6 sm:p-8">
        {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">{error}</div>}
        {ready ? <div className="text-center py-5">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-3xl text-emerald-600">✓</div>
          <h1 className="mt-5 text-2xl font-black text-slate-950">Welcome to Rivox</h1>
          <p className="mt-2 text-slate-500">Your password is saved and your workspace access is ready.</p>
          <button className="btn-primary mt-7 w-full" onClick={() => navigate("/dashboard", { replace: true })}>Continue to dashboard</button>
        </div> : invitation && <>
          <h1 className="text-2xl font-black text-slate-950">Create your password</h1>
          <p className="mt-2 text-sm text-slate-500">You have been invited to join this Rivox workspace.</p>
          <div className="mt-5 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-4 text-sm">
            <div><p className="text-slate-400">Workspace</p><p className="font-bold text-slate-800">{invitation.workspace_name}</p></div>
            <div><p className="text-slate-400">Role</p><p className="font-bold capitalize text-slate-800">{invitation.role}</p></div>
            <div><p className="text-slate-400">Invited by</p><p className="font-bold text-slate-800">{invitation.invited_by_name}</p></div>
            <div><p className="text-slate-400">Email</p><p className="truncate font-bold text-slate-800">{invitation.email}</p></div>
          </div>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block"><span className="label">Password</span><input autoFocus required type="password" autoComplete="new-password" className="input h-12" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
            <div><div className="mb-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full transition-all ${passed < 3 ? "bg-red-500" : passed < 5 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${passed * 20}%` }}/></div><div className="grid grid-cols-2 gap-1">{rules.map((rule) => <p key={rule.label} className={`text-xs ${rule.test(password) ? "text-emerald-600" : "text-slate-400"}`}>{rule.test(password) ? "✓" : "○"} {rule.label}</p>)}</div></div>
            <label className="block"><span className="label">Confirm password</span><input required type="password" autoComplete="new-password" className="input h-12" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></label>
            <button disabled={saving || !passwordIsValid || password !== confirmPassword} className="btn-primary h-12 w-full disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Creating your account..." : "Continue"}</button>
          </form>
        </>}
      </div>
    </section>
  </main>;
}
