import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import {
  hasStaffPermission,
  STAFF_ROLE_LABELS,
  type StaffMember,
  type StaffRole,
} from "../lib/staffPermissions";

interface TaskRow {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  progress?: number | null;
  staff_notes?: string | null;
}

interface TicketRow {
  id: string;
  subject: string;
  message?: string | null;
  status: string;
  priority: string;
  created_at: string;
  staff_notes?: string | null;
}

interface FinanceRow {
  id: string;
  type: string;
  source: string;
  amount: number;
  currency: string;
  status: string;
  title: string;
}

function Card({ title, value, icon, note }: { title: string; value: string | number; icon: string; note?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
      <div className="w-11 h-11 rounded-2xl bg-slate-50 flex items-center justify-center mb-4 text-xl">{icon}</div>
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{title}</div>
      <div className="text-2xl font-bold text-slate-950 mt-1">{value}</div>
      {note && <div className="text-xs text-slate-500 mt-2">{note}</div>}
    </div>
  );
}

const taskStatuses = ["pending", "in_progress", "done", "blocked"];
const ticketStatuses = ["open", "pending", "resolved", "closed"];

export default function StaffDashboard() {
  const { user } = useAuth();
  const [staff, setStaff] = useState<StaffMember | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [finance, setFinance] = useState<FinanceRow[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    if (!user) return;
    const email = user.email?.toLowerCase() ?? "";
    const { data: staffData } = await supabase
      .from("admin_team_members")
      .select("id, auth_user_id, email, name, role, status, notes, created_at")
      .or(`auth_user_id.eq.${user.id},email.eq.${email}`)
      .maybeSingle();

    if (!staffData) return;
    const team = staffData as StaffMember;
    setStaff(team);

    const { data: taskData } = await supabase
      .from("admin_tasks")
      .select("id, title, description, status, priority, due_date, progress, staff_notes")
      .or(`assigned_to.eq.${team.id},assigned_to.is.null`)
      .order("created_at", { ascending: false })
      .limit(30);
    setTasks((taskData as TaskRow[]) ?? []);

    if (hasStaffPermission(team.role, "tickets")) {
      const { data: ticketData } = await supabase
        .from("admin_support_tickets")
        .select("id, subject, message, status, priority, created_at, staff_notes")
        .or(`assigned_to.eq.${team.id},assigned_to.is.null`)
        .order("created_at", { ascending: false })
        .limit(30);
      setTickets((ticketData as TicketRow[]) ?? []);
    }

    if (hasStaffPermission(team.role, "finance")) {
      const { data: financeData } = await supabase
        .from("admin_finance_entries")
        .select("id, type, source, amount, currency, status, title")
        .order("entry_date", { ascending: false })
        .limit(20);
      setFinance((financeData as FinanceRow[]) ?? []);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const role = staff?.role as StaffRole | undefined;
  const incomeTotal = useMemo(
    () => finance.filter((f) => f.type === "income").reduce((sum, row) => sum + Number(row.amount || 0), 0),
    [finance]
  );

  async function updateTask(taskId: string, changes: Partial<TaskRow>) {
    setSavingId(taskId);
    setMessage(null);
    const payload: Record<string, unknown> = {
      ...changes,
      last_staff_update: new Date().toISOString(),
    };
    if (changes.status === "done") payload.completed_at = new Date().toISOString();

    const { error } = await supabase.from("admin_tasks").update(payload).eq("id", taskId);
    setSavingId(null);
    if (error) {
      setMessage(`Task update failed: ${error.message}`);
      return;
    }
    setMessage("Task updated.");
    await load();
  }

  async function updateTicket(ticketId: string, changes: Partial<TicketRow>) {
    setSavingId(ticketId);
    setMessage(null);
    const payload: Record<string, unknown> = {
      ...changes,
      last_staff_update: new Date().toISOString(),
    };
    if (changes.status === "resolved" || changes.status === "closed") payload.resolved_at = new Date().toISOString();

    const { error } = await supabase.from("admin_support_tickets").update(payload).eq("id", ticketId);
    setSavingId(null);
    if (error) {
      setMessage(`Ticket update failed: ${error.message}`);
      return;
    }
    setMessage("Ticket updated.");
    await load();
  }

  const openTaskCount = tasks.filter((t) => t.status !== "done").length;
  const openTicketCount = tickets.filter((t) => t.status !== "resolved" && t.status !== "closed").length;

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-3xl font-bold text-slate-950">Staff Dashboard</h1>
        <p className="text-slate-600 mt-1">
          Welcome {staff?.name || user?.email}. Your role is {role ? STAFF_ROLE_LABELS[role] : "Staff"}.
        </p>
      </div>

      {message && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">{message}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card title="Open Tasks" value={openTaskCount} icon="📋" note="Assigned or shared" />
        <Card title="Open Tickets" value={openTicketCount} icon="🎫" note="Visible to your role" />
        <Card title="Role" value={role ? STAFF_ROLE_LABELS[role] : "Staff"} icon="🔐" />
        {hasStaffPermission(role, "finance") ? (
          <Card title="Visible Income" value={`₹${incomeTotal.toFixed(2)}`} icon="💰" />
        ) : (
          <Card title="Finance Access" value="Hidden" icon="🚫" note="Owner/admin controls this" />
        )}
      </div>

      {hasStaffPermission(role, "tasks") && (
        <section id="tasks" className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-950">My Tasks</h2>
              <p className="text-sm text-slate-500">Update task status, progress and staff notes.</p>
            </div>
            <button onClick={load} className="text-sm font-semibold text-primary-700">Refresh</button>
          </div>
          <div className="divide-y divide-slate-100">
            {tasks.length === 0 ? <div className="p-6 text-slate-500">No tasks yet.</div> : tasks.map((task) => (
              <div key={task.id} className="p-5 space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  <div>
                    <div className="font-semibold text-slate-900">{task.title}</div>
                    {task.description && <div className="text-sm text-slate-500 mt-1">{task.description}</div>}
                    <div className="text-xs text-slate-500 mt-1">Priority: {task.priority} {task.due_date ? `• Due ${task.due_date}` : ""}</div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <select
                      value={task.status}
                      onChange={(e) => updateTask(task.id, { status: e.target.value })}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      disabled={savingId === task.id}
                    >
                      {taskStatuses.map((status) => <option key={status} value={status}>{status.replace("_", " ")}</option>)}
                    </select>
                    <select
                      value={String(task.progress ?? 0)}
                      onChange={(e) => updateTask(task.id, { progress: Number(e.target.value) })}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      disabled={savingId === task.id}
                    >
                      {[0, 25, 50, 75, 100].map((value) => <option key={value} value={value}>{value}%</option>)}
                    </select>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full bg-primary-600" style={{ width: `${task.progress ?? 0}%` }} />
                </div>
                <textarea
                  defaultValue={task.staff_notes ?? ""}
                  placeholder="Add staff note for admin..."
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm min-h-[76px]"
                  onBlur={(e) => {
                    if (e.target.value !== (task.staff_notes ?? "")) updateTask(task.id, { staff_notes: e.target.value });
                  }}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {hasStaffPermission(role, "tickets") && (
        <section id="tickets" className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <h2 className="text-xl font-bold text-slate-950">Support Tickets</h2>
            <p className="text-sm text-slate-500">Update assigned ticket status and notes.</p>
          </div>
          <div className="divide-y divide-slate-100">
            {tickets.length === 0 ? <div className="p-6 text-slate-500">No tickets yet.</div> : tickets.map((ticket) => (
              <div key={ticket.id} className="p-5 space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  <div>
                    <div className="font-semibold text-slate-900">{ticket.subject}</div>
                    {ticket.message && <div className="text-sm text-slate-500 mt-1">{ticket.message}</div>}
                    <div className="text-xs text-slate-500 mt-1">Priority: {ticket.priority} • Created {new Date(ticket.created_at).toLocaleDateString()}</div>
                  </div>
                  <select
                    value={ticket.status}
                    onChange={(e) => updateTicket(ticket.id, { status: e.target.value })}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    disabled={savingId === ticket.id}
                  >
                    {ticketStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </div>
                <textarea
                  defaultValue={ticket.staff_notes ?? ""}
                  placeholder="Add support note for admin..."
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm min-h-[76px]"
                  onBlur={(e) => {
                    if (e.target.value !== (ticket.staff_notes ?? "")) updateTicket(ticket.id, { staff_notes: e.target.value });
                  }}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {hasStaffPermission(role, "finance") && (
        <section id="finance" className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <h2 className="text-xl font-bold text-slate-950">Finance Workspace</h2>
            <p className="text-sm text-slate-500">Finance entries visible to Finance and Full Access roles.</p>
          </div>
          <div className="divide-y divide-slate-100">
            {finance.length === 0 ? <div className="p-6 text-slate-500">No finance entries yet.</div> : finance.map((row) => (
              <div key={row.id} className="p-5 flex items-center justify-between gap-4">
                <div>
                  <div className="font-semibold text-slate-900">{row.title}</div>
                  <div className="text-xs text-slate-500 mt-1">{row.source} • {row.status}</div>
                </div>
                <span className="font-bold text-slate-950">{row.currency} {Number(row.amount).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {hasStaffPermission(role, "read_only") && (
        <section id="reports" className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
          <h2 className="text-xl font-bold text-slate-950">Read-only Reports</h2>
          <p className="text-slate-500 mt-2">Viewer role can see summaries only. Editing tools are hidden.</p>
        </section>
      )}
    </div>
  );
}
