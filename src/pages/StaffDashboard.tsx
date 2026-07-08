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
  status: string;
  priority: string;
  due_date: string | null;
}

interface TicketRow {
  id: string;
  subject: string;
  status: string;
  priority: string;
  created_at: string;
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

export default function StaffDashboard() {
  const { user } = useAuth();
  const [staff, setStaff] = useState<StaffMember | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [finance, setFinance] = useState<FinanceRow[]>([]);

  useEffect(() => {
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
        .select("id, title, status, priority, due_date")
        .or(`assigned_to.eq.${team.id},assigned_to.is.null`)
        .order("created_at", { ascending: false })
        .limit(20);
      setTasks((taskData as TaskRow[]) ?? []);

      if (hasStaffPermission(team.role, "tickets")) {
        const { data: ticketData } = await supabase
          .from("admin_support_tickets")
          .select("id, subject, status, priority, created_at")
          .or(`assigned_to.eq.${team.id},assigned_to.is.null`)
          .order("created_at", { ascending: false })
          .limit(20);
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
    load();
  }, [user]);

  const role = staff?.role as StaffRole | undefined;
  const incomeTotal = useMemo(
    () => finance.filter((f) => f.type === "income").reduce((sum, row) => sum + Number(row.amount || 0), 0),
    [finance]
  );

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-3xl font-bold text-slate-950">Staff Dashboard</h1>
        <p className="text-slate-600 mt-1">
          Welcome {staff?.name || user?.email}. Your role is {role ? STAFF_ROLE_LABELS[role] : "Staff"}.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card title="Assigned Tasks" value={tasks.length} icon="📋" note="Open and shared tasks" />
        <Card title="Open Tickets" value={tickets.filter((t) => t.status !== "resolved" && t.status !== "closed").length} icon="🎫" note="Visible to your role" />
        <Card title="Role" value={role ? STAFF_ROLE_LABELS[role] : "Staff"} icon="🔐" />
        {hasStaffPermission(role, "finance") ? (
          <Card title="Visible Income" value={`₹${incomeTotal.toFixed(2)}`} icon="💰" />
        ) : (
          <Card title="Finance Access" value="Hidden" icon="🚫" note="Owner/admin controls this" />
        )}
      </div>

      {hasStaffPermission(role, "tasks") && (
        <section id="tasks" className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <h2 className="text-xl font-bold text-slate-950">My Tasks</h2>
            <p className="text-sm text-slate-500">Tasks assigned to you or shared with staff.</p>
          </div>
          <div className="divide-y divide-slate-100">
            {tasks.length === 0 ? <div className="p-6 text-slate-500">No tasks yet.</div> : tasks.map((task) => (
              <div key={task.id} className="p-5 flex items-center justify-between gap-4">
                <div>
                  <div className="font-semibold text-slate-900">{task.title}</div>
                  <div className="text-xs text-slate-500 mt-1">Priority: {task.priority} {task.due_date ? `• Due ${task.due_date}` : ""}</div>
                </div>
                <span className="rounded-full bg-slate-100 text-slate-700 px-3 py-1 text-xs font-semibold">{task.status}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {hasStaffPermission(role, "tickets") && (
        <section id="tickets" className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <h2 className="text-xl font-bold text-slate-950">Support Tickets</h2>
            <p className="text-sm text-slate-500">Tickets assigned to you or currently unassigned.</p>
          </div>
          <div className="divide-y divide-slate-100">
            {tickets.length === 0 ? <div className="p-6 text-slate-500">No tickets yet.</div> : tickets.map((ticket) => (
              <div key={ticket.id} className="p-5 flex items-center justify-between gap-4">
                <div>
                  <div className="font-semibold text-slate-900">{ticket.subject}</div>
                  <div className="text-xs text-slate-500 mt-1">Priority: {ticket.priority}</div>
                </div>
                <span className="rounded-full bg-blue-50 text-blue-700 px-3 py-1 text-xs font-semibold">{ticket.status}</span>
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
