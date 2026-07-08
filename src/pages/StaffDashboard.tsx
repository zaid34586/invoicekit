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
  const [taskFilter, setTaskFilter] = useState("open");
  const [ticketFilter, setTicketFilter] = useState("open");
  const [taskSearch, setTaskSearch] = useState("");
  const [ticketSearch, setTicketSearch] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);

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

  async function changePassword() {
    if (!newPassword || newPassword.length < 8) {
      setMessage("Password must be at least 8 characters.");
      return;
    }
    setUpdatingPassword(true);
    setMessage(null);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setUpdatingPassword(false);
    if (error) {
      setMessage(`Password update failed: ${error.message}`);
      return;
    }
    setNewPassword("");
    setMessage("Password updated successfully.");
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const openTaskCount = tasks.filter((t) => t.status !== "done").length;
  const openTicketCount = tickets.filter((t) => t.status !== "resolved" && t.status !== "closed").length;
  const dueTodayTasks = tasks.filter((t) => t.due_date === todayIso && t.status !== "done").length;
  const urgentTickets = tickets.filter((t) => t.priority === "urgent" && t.status !== "closed" && t.status !== "resolved").length;
  const filteredTasks = tasks
    .filter((task) => {
      const search = taskSearch.trim().toLowerCase();
      const matchesSearch = !search || `${task.title} ${task.description ?? ""} ${task.priority} ${task.status}`.toLowerCase().includes(search);
      if (!matchesSearch) return false;
      if (taskFilter === "all") return true;
      if (taskFilter === "open") return task.status !== "done";
      if (taskFilter === "due_today") return task.due_date === todayIso && task.status !== "done";
      return task.status === taskFilter;
    })
    .sort((a, b) => {
      const priorityRank: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
      const prio = (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9);
      if (prio !== 0) return prio;
      return String(a.due_date ?? "9999-12-31").localeCompare(String(b.due_date ?? "9999-12-31"));
    });
  const filteredTickets = tickets
    .filter((ticket) => {
      const search = ticketSearch.trim().toLowerCase();
      const matchesSearch = !search || `${ticket.subject} ${ticket.message ?? ""} ${ticket.priority} ${ticket.status}`.toLowerCase().includes(search);
      if (!matchesSearch) return false;
      if (ticketFilter === "all") return true;
      if (ticketFilter === "open") return ticket.status !== "resolved" && ticket.status !== "closed";
      if (ticketFilter === "urgent") return ticket.priority === "urgent";
      return ticket.status === ticketFilter;
    })
    .sort((a, b) => {
      const priorityRank: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
      const prio = (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9);
      if (prio !== 0) return prio;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

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

      {(dueTodayTasks > 0 || urgentTickets > 0) && (
        <section id="notifications" className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <div className="text-2xl">🔔</div>
            <div>
              <h2 className="font-bold text-amber-950">Today's alerts</h2>
              <p className="text-sm text-amber-800 mt-1">
                {dueTodayTasks > 0 ? `${dueTodayTasks} task(s) due today. ` : ""}
                {urgentTickets > 0 ? `${urgentTickets} urgent ticket(s) need attention.` : ""}
              </p>
            </div>
          </div>
        </section>
      )}

      {hasStaffPermission(role, "tasks") && (
        <section id="tasks" className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-slate-950">My Tasks</h2>
              <p className="text-sm text-slate-500">Update task status, progress and staff notes.</p>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <input
                value={taskSearch}
                onChange={(e) => setTaskSearch(e.target.value)}
                placeholder="Search tasks..."
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <select value={taskFilter} onChange={(e) => setTaskFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <option value="open">Open</option>
                <option value="due_today">Due today</option>
                <option value="pending">Pending</option>
                <option value="in_progress">In progress</option>
                <option value="blocked">Blocked</option>
                <option value="done">Done</option>
                <option value="all">All</option>
              </select>
              <button onClick={load} className="text-sm font-semibold text-primary-700">Refresh</button>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {filteredTasks.length === 0 ? <div className="p-6 text-slate-500">No tasks found for this filter.</div> : filteredTasks.map((task) => (
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
                    {task.status !== "done" && (
                      <button
                        onClick={() => updateTask(task.id, { status: "done", progress: 100 })}
                        disabled={savingId === task.id}
                        className="rounded-xl bg-emerald-600 text-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
                      >
                        Mark Done
                      </button>
                    )}
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
          <div className="p-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-slate-950">Support Tickets</h2>
              <p className="text-sm text-slate-500">Update assigned ticket status and notes.</p>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <input
              value={ticketSearch}
              onChange={(e) => setTicketSearch(e.target.value)}
              placeholder="Search tickets..."
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <select value={ticketFilter} onChange={(e) => setTicketFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="open">Open</option>
              <option value="urgent">Urgent</option>
              <option value="pending">Pending</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
              <option value="all">All</option>
            </select>
            <button onClick={load} className="text-sm font-semibold text-primary-700">Refresh</button>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {filteredTickets.length === 0 ? <div className="p-6 text-slate-500">No tickets found for this filter.</div> : filteredTickets.map((ticket) => (
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
                  {ticket.status !== "resolved" && ticket.status !== "closed" && (
                    <button
                      onClick={() => updateTicket(ticket.id, { status: "resolved" })}
                      disabled={savingId === ticket.id}
                      className="rounded-xl bg-emerald-600 text-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
                    >
                      Resolve
                    </button>
                  )}
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

      <section id="profile" className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
          <div>
            <h2 className="text-xl font-bold text-slate-950">My Profile</h2>
            <p className="text-sm text-slate-500 mt-1">Your staff account and access summary.</p>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                <div className="text-slate-500 text-xs font-semibold uppercase">Name</div>
                <div className="font-semibold text-slate-900 mt-1">{staff?.name || "Not set"}</div>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                <div className="text-slate-500 text-xs font-semibold uppercase">Email</div>
                <div className="font-semibold text-slate-900 mt-1">{staff?.email || user?.email}</div>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                <div className="text-slate-500 text-xs font-semibold uppercase">Role</div>
                <div className="font-semibold text-slate-900 mt-1">{role ? STAFF_ROLE_LABELS[role] : "Staff"}</div>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                <div className="text-slate-500 text-xs font-semibold uppercase">Status</div>
                <div className="font-semibold text-slate-900 mt-1">{staff?.status || "active"}</div>
              </div>
            </div>
          </div>
          <div className="w-full lg:max-w-sm rounded-2xl border border-slate-200 p-4 bg-slate-50">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Change password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="New password, min 8 characters"
            />
            <button
              onClick={changePassword}
              disabled={updatingPassword || newPassword.length < 8}
              className="mt-3 w-full rounded-xl bg-slate-900 text-white text-sm font-semibold py-2.5 disabled:opacity-50"
            >
              {updatingPassword ? "Updating..." : "Update Password"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
