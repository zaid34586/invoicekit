import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { hasStaffPermission, STAFF_ROLE_LABELS, type StaffMember, type StaffRole } from "../lib/staffPermissions";
import CommunicationCenter from "../components/CommunicationCenter";

interface TaskRow { id: string; title: string; description?: string | null; status: string; priority: string; due_date: string | null; progress?: number | null; staff_notes?: string | null; internal_notes?: string | null; department?: string | null; last_staff_update?: string | null; }
interface TicketRow { id: string; ticket_number?: string | null; subject: string; message?: string | null; status: string; priority: string; created_at: string; staff_notes?: string | null; sla_target_minutes?: number | null; first_admin_reply_at?: string | null; assigned_to?: string | null; }
interface FinanceRow { id: string; type: string; source: string; amount: number; currency: string; status: string; title: string; }
interface NotificationRow { id: string; title: string; body: string | null; type: string; read_at: string | null; created_at: string; metadata?: { task_id?: string; ticket_id?: string } | null; }

const taskStatuses = ["pending", "in_progress", "blocked", "done"];
const ticketStatuses = ["open", "in_progress", "waiting_customer", "pending", "resolved", "closed"];

function ticketSla(ticket: TicketRow) {
  if (ticket.first_admin_reply_at) return "First response sent";
  const due = new Date(ticket.created_at).getTime() + Number(ticket.sla_target_minutes || 1440) * 60000;
  const minutes = Math.ceil((due - Date.now()) / 60000);
  if (minutes <= 0) return `SLA breached ${Math.abs(minutes)}m`;
  return minutes < 60 ? `${minutes}m remaining` : `${Math.ceil(minutes / 60)}h remaining`;
}

function StatCard({ label, value, note, icon }: { label: string; value: string | number; note?: string; icon: string }) {
  return (
    <div className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm hover:shadow-md transition">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div>
          <div className="text-3xl font-black text-slate-950 mt-2">{value}</div>
          {note && <div className="text-xs text-slate-500 mt-2">{note}</div>}
        </div>
        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-xl">{icon}</div>
      </div>
    </div>
  );
}

function Badge({ children, tone = "slate" }: { children: string; tone?: "slate" | "green" | "red" | "amber" | "blue" | "purple" }) {
  const cls = {
    slate: "bg-slate-100 text-slate-700 border-slate-200",
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    red: "bg-red-50 text-red-700 border-red-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    purple: "bg-purple-50 text-purple-700 border-purple-200",
  }[tone];
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${cls}`}>{children}</span>;
}

function taskStatusLabel(status: string) {
  if (status === "pending") return "Assigned";
  if (status === "in_progress") return "In Progress";
  if (status === "blocked") return "Need Help";
  if (status === "done") return "Completed";
  return status.replace("_", " ");
}

function appendLog(existing: string | null | undefined, author: string, text: string) {
  const stamp = new Date().toLocaleString();
  const clean = text.trim();
  if (!clean) return existing ?? "";
  return `${existing ? `${existing}\n\n` : ""}[${stamp}] ${author}: ${clean}`;
}

function Section({ title, subtitle, children, actions }: { title: string; subtitle?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-white border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-950">{title}</h2>
          {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export default function StaffDashboard() {
  const { user } = useAuth();
  const [staff, setStaff] = useState<StaffMember | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [finance, setFinance] = useState<FinanceRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [taskFilter, setTaskFilter] = useState("open");
  const [ticketFilter, setTicketFilter] = useState("open");
  const [taskSearch, setTaskSearch] = useState("");
  const [ticketSearch, setTicketSearch] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [active, setActive] = useState(() => window.location.hash.replace("#", "") || "dashboard");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskComment, setTaskComment] = useState("");

  useEffect(() => {
    const onHash = () => setActive(window.location.hash.replace("#", "") || "dashboard");
    window.addEventListener("hashchange", onHash);
    onHash();
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

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

    if (hasStaffPermission(team.role, "tasks")) {
      const { data: taskData } = await supabase
        .from("admin_tasks")
        .select("id, title, description, status, priority, due_date, progress, staff_notes, internal_notes, department, last_staff_update")
        .or(`assigned_to.eq.${team.id},assigned_to.is.null`)
        .order("created_at", { ascending: false })
        .limit(40);
      setTasks((taskData as TaskRow[]) ?? []);
    }

    if (hasStaffPermission(team.role, "tickets")) {
      const { data: ticketData } = await supabase
        .from("admin_support_tickets")
        .select("id, ticket_number, subject, message, status, priority, created_at, staff_notes, sla_target_minutes, first_admin_reply_at, assigned_to")
        .or(`assigned_to.eq.${team.id},assigned_to.is.null`)
        .order("created_at", { ascending: false })
        .limit(40);
      setTickets((ticketData as TicketRow[]) ?? []);
    }

    const { data: notificationData } = await supabase
      .from("notifications")
      .select("id, title, body, type, read_at, created_at, metadata")
      .is("read_at", null)
      .or(`recipient_team_member_id.eq.${team.id},role.eq.${team.role},audience.eq.staff,audience.eq.all`)
      .order("created_at", { ascending: false })
      .limit(20);
    setNotifications((notificationData as NotificationRow[]) ?? []);

    if (hasStaffPermission(team.role, "finance")) {
      const { data: financeData } = await supabase
        .from("admin_finance_entries")
        .select("id, type, source, amount, currency, status, title")
        .order("entry_date", { ascending: false })
        .limit(20);
      setFinance((financeData as FinanceRow[]) ?? []);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user]);

  const role = staff?.role as StaffRole | undefined;
  const todayIso = new Date().toISOString().slice(0, 10);
  const openTaskCount = tasks.filter((t) => t.status !== "done").length;
  const completedTaskCount = tasks.filter((t) => t.status === "done").length;
  const dueTodayTasks = tasks.filter((t) => t.due_date === todayIso && t.status !== "done").length;
  const openTicketCount = tickets.filter((t) => t.status !== "resolved" && t.status !== "closed").length;
  const urgentTickets = tickets.filter((t) => t.priority === "urgent" && t.status !== "closed" && t.status !== "resolved").length;
  const incomeTotal = useMemo(() => finance.filter((f) => f.type === "income").reduce((sum, row) => sum + Number(row.amount || 0), 0), [finance]);

  const filteredTasks = tasks.filter((task) => {
    const search = taskSearch.trim().toLowerCase();
    const matchesSearch = !search || `${task.title} ${task.description ?? ""} ${task.priority} ${task.status}`.toLowerCase().includes(search);
    if (!matchesSearch) return false;
    if (taskFilter === "all") return true;
    if (taskFilter === "open") return task.status !== "done";
    if (taskFilter === "due_today") return task.due_date === todayIso && task.status !== "done";
    return task.status === taskFilter;
  });

  const filteredTickets = tickets.filter((ticket) => {
    const search = ticketSearch.trim().toLowerCase();
    const matchesSearch = !search || `${ticket.subject} ${ticket.message ?? ""} ${ticket.priority} ${ticket.status}`.toLowerCase().includes(search);
    if (!matchesSearch) return false;
    if (ticketFilter === "all") return true;
    if (ticketFilter === "open") return ticket.status !== "resolved" && ticket.status !== "closed";
    if (ticketFilter === "urgent") return ticket.priority === "urgent";
    return ticket.status === ticketFilter;
  });

  const selectedTask = selectedTaskId ? tasks.find((task) => task.id === selectedTaskId) ?? null : null;

  async function markNotificationRead(notificationId: string) {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", notificationId);
    await load();
  }
  async function markAllNotificationsRead() {
    if (!staff) return;
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null).or(`recipient_team_member_id.eq.${staff.id},role.eq.${staff.role},audience.eq.staff,audience.eq.all`);
    await load();
  }

  async function updateTask(taskId: string, changes: Partial<TaskRow>) {
    setSavingId(taskId); setMessage(null);
    const payload: Record<string, unknown> = { ...changes, last_staff_update: new Date().toISOString() };
    if (changes.status === "done") payload.completed_at = new Date().toISOString();
    const { error } = await supabase.from("admin_tasks").update(payload).eq("id", taskId);
    setSavingId(null);
    if (error) { setMessage(`Task update failed: ${error.message}`); return; }
    await supabase.from("admin_audit_logs").insert({ actor_user_id: user?.id, action: "staff_task_update", target_type: "task", target_id: taskId, details: { changes, staff_email: user?.email } });
    await supabase.from("notifications").insert({ audience: "admin", type: "task_update", title: "Task updated by staff", body: `${user?.email ?? "Staff"} updated a task.`, metadata: { task_id: taskId, changes } });
    setMessage("Task updated successfully."); await load();
  }

  async function quickTaskAction(task: TaskRow, status: string, progress: number) {
    await updateTask(task.id, { status, progress });
  }

  async function addTaskComment(task: TaskRow) {
    const nextNotes = appendLog(task.staff_notes, staff?.name || user?.email || "Staff", taskComment);
    setTaskComment("");
    await updateTask(task.id, { staff_notes: nextNotes });
  }

  async function updateTicket(ticketId: string, changes: Partial<TicketRow>) {
    setSavingId(ticketId); setMessage(null);
    const payload: Record<string, unknown> = { ...changes, last_staff_update: new Date().toISOString() };
    if (changes.status === "resolved" || changes.status === "closed") payload.resolved_at = new Date().toISOString();
    const { error } = await supabase.from("admin_support_tickets").update(payload).eq("id", ticketId);
    setSavingId(null);
    if (error) { setMessage(`Ticket update failed: ${error.message}`); return; }
    await supabase.from("admin_audit_logs").insert({ actor_user_id: user?.id, action: "staff_ticket_update", target_type: "support_ticket", target_id: ticketId, details: { changes, staff_email: user?.email } });
    await supabase.from("notifications").insert({ audience: "admin", type: "ticket_update", title: "Ticket updated by staff", body: `${user?.email ?? "Staff"} updated a support ticket.`, metadata: { ticket_id: ticketId, changes } });
    setMessage("Ticket updated successfully."); await load();
  }

  async function changePassword() {
    if (!newPassword || newPassword.length < 8) { setMessage("Password must be at least 8 characters."); return; }
    setUpdatingPassword(true); setMessage(null);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setUpdatingPassword(false);
    if (error) { setMessage(`Password update failed: ${error.message}`); return; }
    setNewPassword(""); setMessage("Password updated successfully.");
  }

  function DashboardPage() {
    return (
      <div className="space-y-6">
        <div className="rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white p-6 sm:p-8 shadow-xl">
          <div className="max-w-3xl">
            <div className="text-sm text-slate-300 font-semibold">Welcome back</div>
            <h1 className="text-3xl sm:text-4xl font-black mt-2">{staff?.name || user?.email}</h1>
            <p className="text-slate-300 mt-3">This is your role-based workspace. Only tools assigned to your role are visible.</p>
          </div>
        </div>
        {message && <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">{message}</div>}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard label="Open Tasks" value={openTaskCount} icon="✅" note={`${dueTodayTasks} due today`} />
          <StatCard label="Open Tickets" value={openTicketCount} icon="🎧" note={`${urgentTickets} urgent`} />
          <StatCard label="Completed" value={completedTaskCount} icon="🏁" note="Tasks completed" />
          <StatCard label="Role" value={role ? STAFF_ROLE_LABELS[role] : "Staff"} icon="🔐" />
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Section title="Priority Work" subtitle="Tasks due today and urgent tickets.">
            <div className="p-5 space-y-3">
              {dueTodayTasks === 0 && urgentTickets === 0 ? <div className="text-slate-500">No urgent work right now.</div> : null}
              {tasks.filter(t => t.due_date === todayIso && t.status !== "done").slice(0, 4).map(t => <a key={t.id} href="#tasks" className="block rounded-2xl border border-slate-200 p-4 hover:bg-slate-50"><div className="font-bold text-slate-900">{t.title}</div><div className="text-xs text-slate-500 mt-1">Due today • {t.priority}</div></a>)}
              {tickets.filter(t => t.priority === "urgent" && t.status !== "resolved" && t.status !== "closed").slice(0, 4).map(t => <a key={t.id} href="#tickets" className="block rounded-2xl border border-red-200 bg-red-50 p-4"><div className="font-bold text-red-950">{t.subject}</div><div className="text-xs text-red-700 mt-1">Urgent ticket</div></a>)}
            </div>
          </Section>
          <Section title="Recent Notifications" subtitle="Latest unread updates.">
            <div className="p-5 space-y-3">
              {notifications.slice(0, 5).length === 0 ? <div className="text-slate-500">No unread notifications.</div> : notifications.slice(0, 5).map(n => <a key={n.id} href="#notifications" className="block rounded-2xl border border-slate-200 p-4 hover:bg-slate-50"><div className="font-bold text-slate-900">{n.title}</div>{n.body && <div className="text-sm text-slate-500 mt-1">{n.body}</div>}</a>)}
            </div>
          </Section>
        </div>
      </div>
    );
  }

  function TasksPage() {
    if (!hasStaffPermission(role, "tasks")) return <Blocked />;
    return (
      <div className="space-y-6">
        <Section
          title="My Tasks"
          subtitle="Open a task, start work, add updates and submit it for admin review."
          actions={
            <div className="flex flex-col sm:flex-row gap-2">
              <input value={taskSearch} onChange={(e) => setTaskSearch(e.target.value)} placeholder="Search tasks..." className="rounded-2xl border border-slate-200 px-4 py-2 text-sm" />
              <select value={taskFilter} onChange={(e) => setTaskFilter(e.target.value)} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm">
                <option value="open">Open</option><option value="due_today">Due today</option><option value="pending">Assigned</option><option value="in_progress">In progress</option><option value="blocked">Need help</option><option value="done">Completed</option><option value="all">All</option>
              </select>
            </div>
          }
        >
          <div className="divide-y divide-slate-100">
            {filteredTasks.length === 0 ? (
              <div className="p-10 text-center text-slate-500">No tasks found.</div>
            ) : filteredTasks.map(task => (
              <button key={task.id} onClick={() => { setSelectedTaskId(task.id); setTaskComment(""); }} className="w-full text-left p-5 hover:bg-slate-50 transition">
                <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap gap-2 mb-2">
                      <Badge tone={task.priority === "urgent" || task.priority === "high" ? "red" : task.priority === "medium" ? "amber" : "slate"}>{task.priority}</Badge>
                      <Badge tone={task.status === "done" ? "green" : task.status === "blocked" ? "red" : task.status === "in_progress" ? "blue" : "purple"}>{taskStatusLabel(task.status)}</Badge>
                      {task.department && <Badge tone="slate">{task.department}</Badge>}
                    </div>
                    <div className="font-black text-slate-950">{task.title}</div>
                    {task.description && <div className="text-sm text-slate-500 mt-1 line-clamp-2">{task.description}</div>}
                    <div className="text-xs text-slate-400 mt-2">{task.due_date ? `Due ${task.due_date}` : "No due date"}{task.last_staff_update ? ` · Updated ${new Date(task.last_staff_update).toLocaleString()}` : ""}</div>
                  </div>
                  <div className="min-w-[180px]">
                    <div className="text-xs font-bold text-slate-500 mb-1">Progress {task.progress ?? 0}%</div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-slate-950" style={{ width: `${task.progress ?? 0}%` }} /></div>
                    <div className="text-xs text-primary-700 font-bold mt-2">Open task →</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </Section>

        {selectedTask && (
          <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm p-4 flex items-center justify-center">
            <div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-3xl bg-white shadow-2xl border border-slate-200">
              <div className="p-6 border-b border-slate-100 flex items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    <Badge tone={selectedTask.priority === "urgent" || selectedTask.priority === "high" ? "red" : selectedTask.priority === "medium" ? "amber" : "slate"}>{selectedTask.priority}</Badge>
                    <Badge tone={selectedTask.status === "done" ? "green" : selectedTask.status === "blocked" ? "red" : selectedTask.status === "in_progress" ? "blue" : "purple"}>{taskStatusLabel(selectedTask.status)}</Badge>
                  </div>
                  <h2 className="text-2xl font-black text-slate-950">{selectedTask.title}</h2>
                  <p className="text-sm text-slate-500 mt-1">{selectedTask.due_date ? `Due ${selectedTask.due_date}` : "No due date"} · Progress {selectedTask.progress ?? 0}%</p>
                </div>
                <button onClick={() => setSelectedTaskId(null)} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">Close</button>
              </div>

              <div className="p-6 grid lg:grid-cols-[1fr_320px] gap-6">
                <div className="space-y-5">
                  <div className="rounded-2xl bg-slate-50 border border-slate-100 p-5">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Task brief</div>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{selectedTask.description || "No description provided."}</p>
                  </div>
                  {selectedTask.internal_notes && (
                    <div className="rounded-2xl bg-amber-50 border border-amber-100 p-5">
                      <div className="text-xs font-bold uppercase tracking-wide text-amber-700 mb-2">Admin note</div>
                      <p className="text-sm text-amber-900 whitespace-pre-wrap">{selectedTask.internal_notes}</p>
                    </div>
                  )}
                  <div className="rounded-2xl border border-slate-200 p-5">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">Work updates & proof notes</div>
                    <div className="min-h-[90px] rounded-2xl bg-slate-50 border border-slate-100 p-4 text-sm text-slate-700 whitespace-pre-wrap">{selectedTask.staff_notes || "No updates yet. Add your first update below."}</div>
                    <textarea value={taskComment} onChange={(e) => setTaskComment(e.target.value)} placeholder="Write what you checked, proof links, blockers, customer response, or final result..." className="mt-4 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm min-h-[100px]" />
                    <button onClick={() => addTaskComment(selectedTask)} disabled={savingId === selectedTask.id || !taskComment.trim()} className="mt-3 rounded-2xl bg-slate-950 text-white px-4 py-2 text-sm font-bold disabled:opacity-50">Add update</button>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">Quick actions</div>
                    <div className="grid gap-2">
                      <button onClick={() => quickTaskAction(selectedTask, "in_progress", Math.max(selectedTask.progress ?? 0, 25))} disabled={savingId === selectedTask.id} className="rounded-2xl bg-blue-600 text-white px-4 py-3 text-sm font-bold">Start work</button>
                      <button onClick={() => quickTaskAction(selectedTask, "blocked", selectedTask.progress ?? 25)} disabled={savingId === selectedTask.id} className="rounded-2xl bg-amber-500 text-white px-4 py-3 text-sm font-bold">Need help</button>
                      <button onClick={() => quickTaskAction(selectedTask, "done", 100)} disabled={savingId === selectedTask.id} className="rounded-2xl bg-emerald-600 text-white px-4 py-3 text-sm font-bold">Submit for review</button>
                    </div>
                  </div>
                  <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4 text-xs text-emerald-800">
                    <div className="font-black uppercase tracking-wide mb-2">Before submit checklist</div>
                    <ul className="space-y-1 list-disc pl-4">
                      <li>Open and verify the related customer/user data if this task needs it.</li>
                      <li>Add a clear work update with what you checked.</li>
                      <li>Paste proof links or screenshots in the update box if needed.</li>
                    </ul>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">Manual progress</div>
                    <select value={selectedTask.status} onChange={(e) => updateTask(selectedTask.id, { status: e.target.value })} disabled={savingId === selectedTask.id} className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm mb-2">
                      {taskStatuses.map(status => <option key={status} value={status}>{taskStatusLabel(status)}</option>)}
                    </select>
                    <select value={String(selectedTask.progress ?? 0)} onChange={(e) => updateTask(selectedTask.id, { progress: Number(e.target.value) })} disabled={savingId === selectedTask.id} className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm">
                      {[0,25,50,75,100].map(v => <option key={v} value={v}>{v}%</option>)}
                    </select>
                  </div>
                  <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 text-xs text-slate-500">
                    Proof upload can be added after storage setup. For now, paste screenshot links, PDF links, or verification notes in Work updates before submitting for review.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  function TicketsPage() {
    if (!hasStaffPermission(role, "tickets")) return <Blocked />;
    return <Section title="Support Tickets" subtitle="Handle assigned customer issues." actions={<div className="flex flex-col sm:flex-row gap-2"><input value={ticketSearch} onChange={(e) => setTicketSearch(e.target.value)} placeholder="Search tickets..." className="rounded-2xl border border-slate-200 px-4 py-2 text-sm"/><select value={ticketFilter} onChange={(e) => setTicketFilter(e.target.value)} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm"><option value="open">Open</option><option value="urgent">Urgent</option><option value="pending">Pending</option><option value="resolved">Resolved</option><option value="closed">Closed</option><option value="all">All</option></select></div>}>
      <div className="divide-y divide-slate-100">{filteredTickets.length === 0 ? <div className="p-10 text-center text-slate-500">No support tickets found.</div> : filteredTickets.map(ticket => <div key={ticket.id} className="p-5 space-y-4"><div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4"><div><div className="flex flex-wrap gap-2 mb-2"><Badge tone={ticket.priority === "urgent" || ticket.priority === "high" ? "red" : ticket.priority === "medium" ? "amber" : "slate"}>{ticket.priority}</Badge><Badge tone={ticket.status === "resolved" || ticket.status === "closed" ? "green" : "blue"}>{ticket.status.replaceAll("_", " ")}</Badge><Badge tone={ticket.first_admin_reply_at ? "green" : ticketSla(ticket).includes("breached") ? "red" : "amber"}>{ticketSla(ticket)}</Badge></div><div className="text-xs font-bold text-indigo-600">{ticket.ticket_number || ticket.id.slice(0,8)}</div><div className="font-black text-slate-950">{ticket.subject}</div>{ticket.message && <div className="text-sm text-slate-500 mt-1">{ticket.message}</div>}<div className="text-xs text-slate-400 mt-2">Created {new Date(ticket.created_at).toLocaleString()}</div></div><div className="flex gap-2 flex-wrap"><select value={ticket.status} onChange={(e) => updateTicket(ticket.id, { status: e.target.value })} disabled={savingId === ticket.id} className="rounded-2xl border border-slate-200 px-3 py-2 text-sm">{ticketStatuses.map(status => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select>{ticket.status !== "resolved" && ticket.status !== "closed" && <button onClick={() => updateTicket(ticket.id, { status: "in_progress" })} disabled={savingId === ticket.id} className="rounded-2xl bg-indigo-600 text-white px-4 py-2 text-sm font-bold">Start work</button>}</div></div><textarea defaultValue={ticket.staff_notes ?? ""} placeholder="Support note / resolution summary..." className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm min-h-[90px]" onBlur={(e) => { if (e.target.value !== (ticket.staff_notes ?? "")) updateTicket(ticket.id, { staff_notes: e.target.value }); }} /></div>)}</div>
    </Section>;
  }


  function CommunicationPage() {
    if (!hasStaffPermission(role, "communication")) return <Blocked />;
    return (
      <CommunicationCenter
        actorName={staff?.name || user?.email || "Staff"}
        actorRole={role ? STAFF_ROLE_LABELS[role] : "Staff"}
        canManageChannels={role === "full_access"}
      />
    );
  }

  function NotificationsPage() {
    return <Section title="Notifications" subtitle="Unread role and task updates." actions={notifications.length > 0 && <button onClick={markAllNotificationsRead} className="rounded-2xl bg-slate-950 text-white px-4 py-2 text-sm font-bold">Mark all read</button>}>
      <div className="divide-y divide-slate-100">{notifications.length === 0 ? <div className="p-10 text-center text-slate-500">No unread notifications.</div> : notifications.map(n => <div key={n.id} className="p-5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 hover:bg-slate-50 cursor-pointer" onClick={() => { markNotificationRead(n.id); if (n.metadata?.task_id || n.type === "task_assigned") { window.location.hash = "tasks"; } else if (n.metadata?.ticket_id || n.type === "ticket_assigned") { window.location.hash = "tickets"; } }}><div><div className="font-black text-slate-950">{n.title}</div>{n.body && <div className="text-sm text-slate-500 mt-1">{n.body}</div>}<div className="text-xs text-slate-400 mt-2">{new Date(n.created_at).toLocaleString()} • {n.type.replace("_", " ")}</div></div><button onClick={(e) => { e.stopPropagation(); markNotificationRead(n.id); }} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">Mark read</button></div>)}</div>
    </Section>;
  }

  function FinancePage() {
    if (!hasStaffPermission(role, "finance")) return <Blocked />;
    return <Section title="Finance Workspace" subtitle="Finance entries visible to finance roles."><div className="p-5"><div className="mb-5"><StatCard label="Visible Income" value={`₹${incomeTotal.toFixed(2)}`} icon="💰" /></div><div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 overflow-hidden">{finance.length === 0 ? <div className="p-8 text-slate-500">No finance entries.</div> : finance.map(row => <div key={row.id} className="p-4 flex items-center justify-between"><div><div className="font-bold text-slate-950">{row.title}</div><div className="text-xs text-slate-500">{row.source} • {row.status}</div></div><div className="font-black">{row.currency} {Number(row.amount).toFixed(2)}</div></div>)}</div></div></Section>;
  }

  function ReportsPage() {
    return <Section title="Reports" subtitle="Staff productivity summary."><div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4"><StatCard label="Tasks Done" value={completedTaskCount} icon="🏁" /><StatCard label="Open Work" value={openTaskCount + openTicketCount} icon="📌" /><StatCard label="Urgent Items" value={urgentTickets + dueTodayTasks} icon="⚠️" /></div></Section>;
  }

  function ProfilePage() {
    return <Section title="My Profile" subtitle="Your staff identity and security."><div className="p-5 grid grid-cols-1 xl:grid-cols-2 gap-5"><div className="rounded-3xl border border-slate-200 p-5 bg-slate-50"><div className="w-16 h-16 rounded-3xl bg-slate-950 text-white flex items-center justify-center font-black text-xl mb-4">{(staff?.name || user?.email || "S").slice(0,1).toUpperCase()}</div><div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm"><div><div className="text-xs uppercase font-bold text-slate-500">Name</div><div className="font-bold text-slate-950">{staff?.name || "Not set"}</div></div><div><div className="text-xs uppercase font-bold text-slate-500">Email</div><div className="font-bold text-slate-950 break-all">{staff?.email || user?.email}</div></div><div><div className="text-xs uppercase font-bold text-slate-500">Role</div><div className="font-bold text-slate-950">{role ? STAFF_ROLE_LABELS[role] : "Staff"}</div></div><div><div className="text-xs uppercase font-bold text-slate-500">Status</div><div className="font-bold text-emerald-700">{staff?.status || "active"}</div></div></div></div><div className="rounded-3xl border border-slate-200 p-5"><label className="block text-xs font-bold text-slate-500 uppercase mb-2">Change password</label><input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="New password, min 8 characters"/><button onClick={changePassword} disabled={updatingPassword || newPassword.length < 8} className="mt-3 w-full rounded-2xl bg-slate-950 text-white py-3 text-sm font-bold disabled:opacity-50">{updatingPassword ? "Updating..." : "Update Password"}</button></div></div></Section>;
  }

  function SettingsPage() {
    return <Section title="Settings" subtitle="Staff workspace preferences."><div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4"><div className="rounded-2xl border border-slate-200 p-4"><div className="font-bold text-slate-950">Notifications</div><p className="text-sm text-slate-500 mt-1">Task and ticket alerts are enabled by default.</p></div><div className="rounded-2xl border border-slate-200 p-4"><div className="font-bold text-slate-950">Security</div><p className="text-sm text-slate-500 mt-1">Use profile section to update your password.</p></div></div></Section>;
  }

  function UsersPage() { return hasStaffPermission(role, "users") ? <Section title="Users" subtitle="Assigned customer support workspace."><div className="p-10 text-center text-slate-500">User support tools will show assigned customers here.</div></Section> : <Blocked />; }
  function Blocked() { return <div className="rounded-3xl bg-white border border-slate-200 p-10 text-center"><div className="text-4xl mb-3">🔒</div><h2 className="text-xl font-black text-slate-950">Access not available</h2><p className="text-slate-500 mt-2">This section is hidden for your role.</p></div>; }

  if (active === "tasks") return <TasksPage />;
  if (active === "tickets") return <TicketsPage />;
  if (active === "users") return <UsersPage />;
  if (active === "finance") return <FinancePage />;
  if (active === "reports") return <ReportsPage />;
  if (active === "communication") return <CommunicationPage />;
  if (active === "notifications") return <NotificationsPage />;
  if (active === "profile") return <ProfilePage />;
  if (active === "settings") return <SettingsPage />;
  return <DashboardPage />;
}
