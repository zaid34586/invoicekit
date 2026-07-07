import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { ADMIN_EMAIL, formatDate } from "../lib/constants";
import { formatMoney } from "../lib/currency";
import type { Profile, Invoice } from "../lib/types";
import StatusBadge from "../components/StatusBadge";

type TeamMember = {
  id: string; email: string; name: string | null; role: string; status: string;
  temporary_password: string | null; notes: string | null; created_at: string;
};

type Task = {
  id: string; title: string; description: string | null; assigned_to: string | null;
  priority: string; status: string; due_date: string | null; created_at: string;
};

type FinanceEntry = {
  id: string; entry_date: string; type: "income" | "expense" | "receivable";
  source: string; amount: number; currency: string; status: string; title: string; notes: string | null;
};

const emptyTeam = { email: "", password: "", name: "", role: "limited", notes: "" };
const emptyTask = { title: "", description: "", assigned_to: "", priority: "medium", due_date: "" };
const emptyFinance = { title: "", amount: "", currency: "INR", type: "income", source: "manual", status: "received", notes: "" };

export default function Admin() {
  const { user, loading } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [finance, setFinance] = useState<FinanceEntry[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [userSearch, setUserSearch] = useState("");
  const [teamForm, setTeamForm] = useState(emptyTeam);
  const [taskForm, setTaskForm] = useState(emptyTask);
  const [financeForm, setFinanceForm] = useState(emptyFinance);

  const isAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  async function load() {
    if (!user || !isAdmin) return;
    setDataLoading(true); setError(null);
    try {
      const [profRes, invRes, teamRes, taskRes, finRes] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("invoices").select("*").order("created_at", { ascending: false }),
        supabase.from("admin_team_members").select("*").order("created_at", { ascending: false }),
        supabase.from("admin_tasks").select("*").order("created_at", { ascending: false }),
        supabase.from("admin_finance_entries").select("*").order("entry_date", { ascending: false }),
      ]);
      if (profRes.error) throw profRes.error;
      if (invRes.error) throw invRes.error;
      if (teamRes.error) throw teamRes.error;
      if (taskRes.error) throw taskRes.error;
      if (finRes.error) throw finRes.error;
      setProfiles((profRes.data as Profile[]) ?? []);
      setInvoices((invRes.data as Invoice[]) ?? []);
      setTeam((teamRes.data as TeamMember[]) ?? []);
      setTasks((taskRes.data as Task[]) ?? []);
      setFinance((finRes.data as FinanceEntry[]) ?? []);
      if (!selectedUserId && profRes.data?.[0]) setSelectedUserId((profRes.data[0] as Profile).user_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load admin data. Run the new admin migration first.");
    } finally { setDataLoading(false); }
  }

  useEffect(() => { load(); }, [user, isAdmin]);

  const selectedUser = profiles.find((p) => p.user_id === selectedUserId) ?? profiles[0];
  const selectedInvoices = invoices.filter((i) => i.user_id === selectedUser?.user_id);
  const filteredUsers = profiles.filter((p) => {
    const q = userSearch.toLowerCase();
    return !q || (p.email ?? "").toLowerCase().includes(q) || (p.business_name ?? "").toLowerCase().includes(q) || (p.phone ?? "").toLowerCase().includes(q);
  });

  const stats = useMemo(() => {
    const paid = invoices.filter((i) => i.status === "paid");
    const income = finance.filter((f) => f.type === "income" && f.status === "received").reduce((s, f) => s + Number(f.amount), 0);
    const pending = finance.filter((f) => f.status === "pending" || f.type === "receivable").reduce((s, f) => s + Number(f.amount), 0);
    const expense = finance.filter((f) => f.type === "expense" || f.status === "spent").reduce((s, f) => s + Number(f.amount), 0);
    return [
      ["Total Users", profiles.length], ["Pro Users", profiles.filter((p) => p.is_pro).length],
      ["Banned Users", profiles.filter((p) => p.is_banned).length], ["Invoices", invoices.length],
      ["Paid Invoices", paid.length], ["Team Members", team.length],
      ["Received", formatMoney(income, "INR")], ["Pending/Baki", formatMoney(pending, "INR")], ["Expenses", formatMoney(expense, "INR")],
    ];
  }, [profiles, invoices, team, finance]);

  async function updateProfile(userId: string, patch: Record<string, unknown>, msg: string) {
    setError(null); setNotice(null);
    const { error } = await supabase.from("profiles").update(patch).eq("user_id", userId);
    if (error) return setError(error.message);
    setNotice(msg); await load();
  }

  async function createTeamMember(e: React.FormEvent) {
    e.preventDefault(); setError(null); setNotice(null);
    const { data, error } = await supabase.functions.invoke("create-team-member", { body: teamForm });
    if (error || data?.error) return setError(data?.error ?? error?.message ?? "Failed to create team member");
    setNotice("Team member login created successfully."); setTeamForm(emptyTeam); await load();
  }

  async function createTask(e: React.FormEvent) {
    e.preventDefault(); setError(null); setNotice(null);
    const { error } = await supabase.from("admin_tasks").insert({ ...taskForm, assigned_to: taskForm.assigned_to || null, due_date: taskForm.due_date || null, created_by: user?.id });
    if (error) return setError(error.message);
    setNotice("Task added."); setTaskForm(emptyTask); await load();
  }

  async function createFinance(e: React.FormEvent) {
    e.preventDefault(); setError(null); setNotice(null);
    const { error } = await supabase.from("admin_finance_entries").insert({ ...financeForm, amount: Number(financeForm.amount), created_by: user?.id });
    if (error) return setError(error.message);
    setNotice("Finance entry saved."); setFinanceForm(emptyFinance); await load();
  }

  if (loading || dataLoading) return <div className="p-10 text-center text-slate-500">Loading admin data...</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-fade-in">
      <section id="dashboard" className="space-y-4">
        <div><h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1><p className="text-sm text-slate-500">Full internal control panel for InvoiceKit.</p></div>
        {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
        {notice && <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">{notice}</div>}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">{stats.map(([label, value]) => <div key={String(label)} className="card p-5"><p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p><p className="text-xl font-bold text-slate-900 mt-1">{value}</p></div>)}</div>
      </section>

      <section id="users" className="card">
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div><h2 className="text-lg font-semibold">Users</h2><p className="text-sm text-slate-500">User list, details, invoices, ban/unban.</p></div><input className="input sm:w-80" placeholder="Search user..." value={userSearch} onChange={(e)=>setUserSearch(e.target.value)} /></div>
        <div className="grid lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
          <div className="max-h-[520px] overflow-auto">{filteredUsers.map((p)=><button key={p.user_id} onClick={()=>setSelectedUserId(p.user_id)} className={`w-full text-left p-4 border-b border-slate-100 hover:bg-slate-50 ${selectedUser?.user_id===p.user_id ? "bg-primary-50" : ""}`}><p className="font-medium text-slate-900">{p.business_name || "Unnamed"}</p><p className="text-xs text-slate-500">{p.email || "No email"}</p><div className="flex gap-2 mt-2"><span className="text-xs rounded-full bg-slate-100 px-2 py-0.5">{p.is_pro ? "Pro" : "Free"}</span>{p.is_banned && <span className="text-xs rounded-full bg-red-100 text-red-700 px-2 py-0.5">Banned</span>}</div></button>)}</div>
          <div className="lg:col-span-2 p-5 space-y-5">
            {selectedUser ? <><div className="grid sm:grid-cols-2 gap-3 text-sm"><Info label="Business" value={selectedUser.business_name}/><Info label="Email" value={selectedUser.email}/><Info label="Phone" value={selectedUser.phone}/><Info label="Country" value={selectedUser.country}/><Info label="GST/Tax ID" value={selectedUser.gstin}/><Info label="Joined" value={formatDate(selectedUser.created_at)}/></div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary" onClick={()=>updateProfile(selectedUser.user_id,{ is_banned: !selectedUser.is_banned, banned_at: selectedUser.is_banned ? null : new Date().toISOString(), ban_reason: selectedUser.is_banned ? null : "Admin blocked" }, selectedUser.is_banned ? "User unbanned." : "User banned.")}>{selectedUser.is_banned ? "Unban user" : "Ban user"}</button>
              <button className="btn-secondary" onClick={()=>updateProfile(selectedUser.user_id,{ is_pro: true, plan: "pro", subscription_status: "active", free_pro_until: new Date(Date.now()+30*86400000).toISOString() }, "30 days free Pro given.")}>Give 30 days Pro</button>
              <button className="btn-secondary" onClick={()=>updateProfile(selectedUser.user_id,{ credits: (selectedUser.credits ?? 0) + 10 }, "10 credits added.")}>Add 10 credits</button>
            </div>
            <div><h3 className="font-semibold mb-2">User invoices</h3><div className="overflow-x-auto"><table className="w-full text-sm"><tbody>{selectedInvoices.slice(0,8).map((i)=><tr key={i.id} className="border-t"><td className="py-2">{i.invoice_number}</td><td>{i.client_name}</td><td>{formatMoney(i.invoice_total ?? Number(i.total), i.invoice_currency ?? i.base_currency ?? "INR")}</td><td><StatusBadge status={i.status}/></td></tr>)}</tbody></table></div></div></> : <p>No user selected.</p>}
          </div>
        </div>
      </section>

      <section id="team" className="grid lg:grid-cols-2 gap-6">
        <div className="card p-5"><h2 className="text-lg font-semibold mb-4">Manage Team Members</h2><form onSubmit={createTeamMember} className="space-y-3"><input className="input" placeholder="Name" value={teamForm.name} onChange={e=>setTeamForm({...teamForm,name:e.target.value})}/><input className="input" type="email" required placeholder="Team email" value={teamForm.email} onChange={e=>setTeamForm({...teamForm,email:e.target.value})}/><input className="input" required minLength={8} placeholder="Password (min 8 chars)" value={teamForm.password} onChange={e=>setTeamForm({...teamForm,password:e.target.value})}/><select className="input" value={teamForm.role} onChange={e=>setTeamForm({...teamForm,role:e.target.value})}><option value="full_access">Full Access</option><option value="limited">Limited</option><option value="support">Support</option><option value="finance">Finance</option><option value="viewer">Viewer</option></select><textarea className="input" placeholder="Notes" value={teamForm.notes} onChange={e=>setTeamForm({...teamForm,notes:e.target.value})}/><button className="btn-primary w-full">Create Login</button></form></div>
        <div className="card p-5"><h2 className="text-lg font-semibold mb-4">Team List</h2><div className="space-y-3">{team.map(m=><div key={m.id} className="border rounded-lg p-3"><p className="font-medium">{m.name || m.email}</p><p className="text-xs text-slate-500">{m.email} • {m.role} • {m.status}</p>{m.temporary_password && <p className="text-xs mt-1 text-amber-700">Temp password saved: {m.temporary_password}</p>}</div>)}</div></div>
      </section>

      <section id="credits" className="card p-5"><h2 className="text-lg font-semibold mb-4">Credits & Plans</h2><p className="text-sm text-slate-500 mb-3">Select user from Users section, then use Add Credits / Give Free Pro. Current selected user: <b>{selectedUser?.email ?? "none"}</b></p>{selectedUser && <div className="grid sm:grid-cols-3 gap-3"><Info label="Plan" value={selectedUser.is_pro ? "Pro" : "Free"}/><Info label="Credits" value={String(selectedUser.credits ?? 0)}/><Info label="Free Pro Until" value={selectedUser.free_pro_until ? formatDate(selectedUser.free_pro_until) : "—"}/></div>}</section>

      <section id="invoices" className="card"><div className="p-5 border-b"><h2 className="text-lg font-semibold">All Invoices</h2></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50"><tr><th className="text-left p-3">Invoice</th><th className="text-left p-3">Client</th><th className="text-left p-3">Amount</th><th className="text-left p-3">Status</th><th className="text-left p-3">Date</th></tr></thead><tbody>{invoices.map(i=><tr key={i.id} className="border-t"><td className="p-3 font-medium">{i.invoice_number}</td><td className="p-3">{i.client_name}</td><td className="p-3">{formatMoney(i.invoice_total ?? Number(i.total), i.invoice_currency ?? i.base_currency ?? "INR")}</td><td className="p-3"><StatusBadge status={i.status}/></td><td className="p-3 text-slate-500">{formatDate(i.created_at)}</td></tr>)}</tbody></table></div></section>

      <section id="finance" className="grid lg:grid-cols-2 gap-6"><div className="card p-5"><h2 className="text-lg font-semibold mb-4">Revenue & Finance Entry</h2><form onSubmit={createFinance} className="space-y-3"><input className="input" required placeholder="Title e.g. Ads revenue, Razorpay payout" value={financeForm.title} onChange={e=>setFinanceForm({...financeForm,title:e.target.value})}/><input className="input" required type="number" placeholder="Amount" value={financeForm.amount} onChange={e=>setFinanceForm({...financeForm,amount:e.target.value})}/><div className="grid grid-cols-2 gap-3"><select className="input" value={financeForm.type} onChange={e=>setFinanceForm({...financeForm,type:e.target.value})}><option value="income">Income</option><option value="expense">Expense</option><option value="receivable">Receivable/Baki</option></select><select className="input" value={financeForm.source} onChange={e=>setFinanceForm({...financeForm,source:e.target.value})}><option value="subscription">Subscription</option><option value="ads">Ads</option><option value="invoice">Invoice</option><option value="manual">Manual</option><option value="other">Other</option></select></div><div className="grid grid-cols-2 gap-3"><input className="input" value={financeForm.currency} onChange={e=>setFinanceForm({...financeForm,currency:e.target.value.toUpperCase()})}/><select className="input" value={financeForm.status} onChange={e=>setFinanceForm({...financeForm,status:e.target.value})}><option value="received">Received</option><option value="pending">Pending</option><option value="spent">Spent</option></select></div><textarea className="input" placeholder="Notes" value={financeForm.notes} onChange={e=>setFinanceForm({...financeForm,notes:e.target.value})}/><button className="btn-primary w-full">Save Finance Entry</button></form></div><div className="card p-5"><h2 className="text-lg font-semibold mb-4">Finance Ledger</h2><div className="space-y-3 max-h-96 overflow-auto">{finance.map(f=><div key={f.id} className="border rounded-lg p-3"><div className="flex justify-between"><p className="font-medium">{f.title}</p><p className="font-semibold">{formatMoney(Number(f.amount), f.currency)}</p></div><p className="text-xs text-slate-500">{f.type} • {f.source} • {f.status} • {formatDate(f.entry_date)}</p></div>)}</div></div></section>

      <section id="tasks" className="grid lg:grid-cols-2 gap-6"><div className="card p-5"><h2 className="text-lg font-semibold mb-4">Assign Task</h2><form onSubmit={createTask} className="space-y-3"><input className="input" required placeholder="Task title" value={taskForm.title} onChange={e=>setTaskForm({...taskForm,title:e.target.value})}/><textarea className="input" placeholder="Description" value={taskForm.description} onChange={e=>setTaskForm({...taskForm,description:e.target.value})}/><select className="input" value={taskForm.assigned_to} onChange={e=>setTaskForm({...taskForm,assigned_to:e.target.value})}><option value="">Unassigned</option>{team.map(m=><option key={m.id} value={m.id}>{m.name || m.email}</option>)}</select><div className="grid grid-cols-2 gap-3"><select className="input" value={taskForm.priority} onChange={e=>setTaskForm({...taskForm,priority:e.target.value})}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select><input className="input" type="date" value={taskForm.due_date} onChange={e=>setTaskForm({...taskForm,due_date:e.target.value})}/></div><button className="btn-primary w-full">Add Task</button></form></div><div className="card p-5"><h2 className="text-lg font-semibold mb-4">Task Board</h2><div className="space-y-3">{tasks.map(t=><div key={t.id} className="border rounded-lg p-3"><div className="flex justify-between gap-3"><p className="font-medium">{t.title}</p><span className="text-xs rounded-full bg-slate-100 px-2 py-1">{t.status}</span></div><p className="text-xs text-slate-500 mt-1">{t.priority} priority {t.due_date ? `• due ${formatDate(t.due_date)}` : ""}</p>{t.description && <p className="text-sm text-slate-600 mt-2">{t.description}</p>}</div>)}</div></div></section>
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return <div className="rounded-lg bg-slate-50 border border-slate-100 p-3"><p className="text-xs text-slate-500 uppercase font-semibold">{label}</p><p className="text-sm text-slate-900 mt-1 break-words">{value || "—"}</p></div>;
}
