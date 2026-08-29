import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import PasswordField from "../components/PasswordField";

export default function ChangeTemporaryPassword() {
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) return setError("Use at least 8 characters with uppercase, lowercase, number and special character.");
    if (password !== confirm) return setError("Passwords do not match.");
    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) { setError(updateError.message); setSaving(false); return; }
    const { data, error: claimError } = await supabase.rpc("complete_workspace_member_first_login");
    if (claimError || !data?.claimed) { setError(claimError?.message || "Workspace access could not be activated."); setSaving(false); return; }
    await supabase.auth.updateUser({ data: { force_password_change: false } });
    await refreshProfile();
    navigate("/dashboard", { replace: true });
  }

  return <main className="min-h-screen grid place-items-center bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950 px-4"><section className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl"><img src="/rivox-logo.svg" alt="Rivox" className="h-12 w-12 rounded-xl"/><h1 className="mt-6 text-2xl font-black">Create a new password</h1><p className="mt-2 text-sm text-slate-500">For security, change the temporary password before entering your workspace.</p>{error&&<div className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>}<form onSubmit={submit} className="mt-6 space-y-4"><label className="block"><span className="label">New password</span><PasswordField required autoComplete="new-password" className="input h-12" value={password} onChange={e=>setPassword(e.target.value)}/></label><label className="block"><span className="label">Confirm new password</span><PasswordField required autoComplete="new-password" className="input h-12" value={confirm} onChange={e=>setConfirm(e.target.value)}/></label><button disabled={saving} className="btn-primary h-12 w-full disabled:opacity-50">{saving?"Saving...":"Change password and continue"}</button></form></section></main>;
}
