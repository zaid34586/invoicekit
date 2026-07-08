import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { ADMIN_EMAIL, formatDate } from "../lib/constants";
import { formatMoney } from "../lib/currency";
import type { Profile, Invoice, Client } from "../lib/types";
import StatusBadge from "../components/StatusBadge";

type AdminSection =
  | "dashboard"
  | "users"
  | "credits"
  | "team"
  | "tasks"
  | "finance"
  | "invoices"
  | "analytics"
  | "support"
  | "audit"
  | "settings";

type AdminTeamMember = {
  id: string;
  auth_user_id: string | null;
  email: string;
  name: string | null;
  role: "full_access" | "limited" | "support" | "finance" | "viewer";
  status: "active" | "disabled";
  temporary_password: string | null;
  notes: string | null;
  created_at: string;
};

type AdminTask = {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  status: "pending" | "in_progress" | "done" | "blocked";
  due_date: string | null;
  created_at: string;
};

type AdminFinanceEntry = {
  id: string;
  entry_date: string;
  type: "income" | "expense" | "receivable";
  source: "subscription" | "ads" | "manual" | "invoice" | "other";
  amount: number;
  currency: string;
  status: "received" | "pending" | "spent";
  title: string;
  notes: string | null;
  created_at: string;
};

type AdminAuditLog = {
  id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

type AdminSupportTicket = {
  id: string;
  user_id: string | null;
  subject: string;
  message: string | null;
  status: "open" | "pending" | "resolved" | "closed";
  priority: "low" | "medium" | "high" | "urgent";
  created_at: string;
};

const sections: { id: AdminSection; label: string; icon: string; group: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "📊", group: "Overview" },
  { id: "users", label: "Users", icon: "👥", group: "Users" },
  { id: "credits", label: "Credits & Plans", icon: "💳", group: "Users" },
  { id: "team", label: "Team Members", icon: "👨‍💼", group: "Operations" },
  { id: "tasks", label: "Tasks", icon: "📋", group: "Operations" },
  { id: "finance", label: "Revenue & Finance", icon: "💰", group: "Money" },
  { id: "invoices", label: "All Invoices", icon: "📄", group: "Money" },
  { id: "analytics", label: "Analytics", icon: "📈", group: "Insights" },
  { id: "support", label: "Support Tickets", icon: "🎫", group: "Insights" },
  { id: "audit", label: "Audit Logs", icon: "📝", group: "Security" },
  { id: "settings", label: "Admin Settings", icon: "⚙️", group: "Security" },
];

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}


const roleLabels: Record<AdminTeamMember["role"], string> = {
  full_access: "Full Access",
  limited: "Limited",
  support: "Support",
  finance: "Finance",
  viewer: "Viewer",
};

const roleAccess: Record<AdminTeamMember["role"], string[]> = {
  full_access: ["Dashboard", "Users", "Credits", "Team", "Tasks", "Finance", "Invoices", "Analytics", "Support", "Audit", "Settings"],
  limited: ["Dashboard", "Users", "Tasks"],
  support: ["Users", "Support", "Tasks"],
  finance: ["Finance", "Invoices", "Analytics"],
  viewer: ["Dashboard", "Users", "Invoices", "Analytics"],
};

function generatePassword() {
  const part = Math.random().toString(36).slice(2, 8);
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `IK-${part}-${digits}`;
}

function statusClass(status: string) {
  const map: Record<string, string> = {
    active: "bg-green-50 text-green-700 border-green-200",
    disabled: "bg-red-50 text-red-700 border-red-200",
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    in_progress: "bg-blue-50 text-blue-700 border-blue-200",
    done: "bg-green-50 text-green-700 border-green-200",
    blocked: "bg-red-50 text-red-700 border-red-200",
    received: "bg-green-50 text-green-700 border-green-200",
    spent: "bg-red-50 text-red-700 border-red-200",
    open: "bg-blue-50 text-blue-700 border-blue-200",
    resolved: "bg-green-50 text-green-700 border-green-200",
    closed: "bg-slate-100 text-slate-600 border-slate-200",
  };
  return map[status] ?? "bg-slate-100 text-slate-600 border-slate-200";
}

function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex px-2.5 py-1 rounded-full text-xs font-medium border capitalize", className)}>
      {children}
    </span>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={cx("card", className)}>{children}</div>;
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>
    </div>
  );
}

function emptyFormFinance(): Omit<AdminFinanceEntry, "id" | "created_at"> {
  return {
    entry_date: new Date().toISOString().slice(0, 10),
    type: "income",
    source: "manual",
    amount: 0,
    currency: "INR",
    status: "received",
    title: "",
    notes: "",
  };
}

export default function Admin() {
  const { user, loading } = useAuth();
  const [active, setActive] = useState<AdminSection>("dashboard");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [team, setTeam] = useState<AdminTeamMember[]>([]);
  const [tasks, setTasks] = useState<AdminTask[]>([]);
  const [finance, setFinance] = useState<AdminFinanceEntry[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [supportTickets, setSupportTickets] = useState<AdminSupportTicket[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userPage, setUserPage] = useState(1);
  const [selectedInvoiceStatus, setSelectedInvoiceStatus] = useState<"all" | "draft" | "sent" | "paid" | "overdue">("all");
  const [userSearch, setUserSearch] = useState("");
  const [userFilter, setUserFilter] = useState<"all" | "active" | "banned" | "free" | "pro">("all");
  const [userSort, setUserSort] = useState<"newest" | "oldest" | "credits_high" | "invoices_high">("newest");
  const [adminNotesDraft, setAdminNotesDraft] = useState("");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [teamForm, setTeamForm] = useState({ name: "", email: "", password: "", role: "limited", notes: "" });
  const [teamSearch, setTeamSearch] = useState("");
  const [teamStatusFilter, setTeamStatusFilter] = useState<"all" | "active" | "disabled">("all");
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [taskForm, setTaskForm] = useState({ title: "", description: "", assigned_to: "", priority: "medium", due_date: "" });
  const [financeForm, setFinanceForm] = useState(emptyFormFinance());

  const isAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  async function logAction(action: string, targetType?: string, targetId?: string, details?: Record<string, unknown>) {
    try {
      await supabase.from("admin_audit_logs").insert({
        action,
        target_type: targetType ?? null,
        target_id: targetId ?? null,
        details: details ?? {},
        actor_user_id: user?.id ?? null,
      });
    } catch {
      // Audit logging should never block the admin action.
    }
  }

  async function load() {
    if (!user || !isAdmin) {
      setDataLoading(false);
      return;
    }

    setDataLoading(true);
    setError(null);
    try {
      const [profRes, invRes, clientsRes, teamRes, taskRes, financeRes, auditRes, supportRes] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("invoices").select("*").order("created_at", { ascending: false }),
        supabase.from("clients").select("*").order("created_at", { ascending: false }),
        supabase.from("admin_team_members").select("*").order("created_at", { ascending: false }),
        supabase.from("admin_tasks").select("*").order("created_at", { ascending: false }),
        supabase.from("admin_finance_entries").select("*").order("entry_date", { ascending: false }),
        supabase.from("admin_audit_logs").select("*").order("created_at", { ascending: false }).limit(50),
        supabase.from("admin_support_tickets").select("*").order("created_at", { ascending: false }).limit(50),
      ]);

      if (profRes.error) throw profRes.error;
      if (invRes.error) throw invRes.error;
      if (clientsRes.error) throw clientsRes.error;
      if (teamRes.error) throw teamRes.error;
      if (taskRes.error) throw taskRes.error;
      if (financeRes.error) throw financeRes.error;
      if (auditRes.error) throw auditRes.error;
      if (supportRes.error) throw supportRes.error;

      setProfiles((profRes.data as Profile[]) ?? []);
      setInvoices((invRes.data as Invoice[]) ?? []);
      setClients((clientsRes.data as Client[]) ?? []);
      setTeam((teamRes.data as AdminTeamMember[]) ?? []);
      setTasks((taskRes.data as AdminTask[]) ?? []);
      setFinance((financeRes.data as AdminFinanceEntry[]) ?? []);
      setAuditLogs((auditRes.data as AdminAuditLog[]) ?? []);
      setSupportTickets((supportRes.data as AdminSupportTicket[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load admin data");
    } finally {
      setDataLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isAdmin]);

  const selectedUser = profiles.find((p) => p.id === selectedUserId) ?? profiles[0] ?? null;
  const selectedUserAuthId = selectedUser ? selectedUser.user_id || selectedUser.id : null;
  const selectedUserInvoices = selectedUserAuthId ? invoices.filter((i) => i.user_id === selectedUserAuthId) : [];
  const selectedUserClients = selectedUserAuthId ? clients.filter((c) => c.user_id === selectedUserAuthId) : [];
  const selectedUserInvoiceRevenue = selectedUserInvoices.reduce((sum, inv) => sum + Number(inv.invoice_total ?? inv.total ?? 0), 0);
  const selectedStatusInvoices = selectedInvoiceStatus === "all" ? selectedUserInvoices : selectedUserInvoices.filter((inv) => inv.status === selectedInvoiceStatus);

  useEffect(() => {
    setAdminNotesDraft(String((selectedUser as unknown as { admin_notes?: string | null })?.admin_notes ?? ""));
  }, [selectedUser?.id]);

  useEffect(() => {
    setUserPage(1);
  }, [userSearch, userFilter, userSort]);

  const userInvoiceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const invoice of invoices) {
      counts.set(invoice.user_id, (counts.get(invoice.user_id) ?? 0) + 1);
    }
    return counts;
  }, [invoices]);

  const userClientCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const client of clients) {
      counts.set(client.user_id, (counts.get(client.user_id) ?? 0) + 1);
    }
    return counts;
  }, [clients]);

  const filteredProfiles = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    const matchesSearch = (p: Profile) => {
      if (!q) return true;
      return [p.business_name, p.email, p.gstin, p.phone, p.country, p.plan, p.currency]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    };

    const matchesFilter = (p: Profile) => {
      const isBanned = Boolean((p as unknown as { is_banned?: boolean }).is_banned);
      const isPro = Boolean(p.is_pro || p.plan === "pro" || p.plan === "business");
      if (userFilter === "active") return !isBanned;
      if (userFilter === "banned") return isBanned;
      if (userFilter === "free") return !isBanned && !isPro;
      if (userFilter === "pro") return !isBanned && isPro;
      return true;
    };

    return profiles
      .filter((p) => matchesSearch(p) && matchesFilter(p))
      .sort((a, b) => {
        if (userSort === "oldest") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        if (userSort === "credits_high") return Number((b as unknown as { credits?: number }).credits ?? 0) - Number((a as unknown as { credits?: number }).credits ?? 0);
        if (userSort === "invoices_high") return (userInvoiceCounts.get(b.user_id || b.id) ?? 0) - (userInvoiceCounts.get(a.user_id || a.id) ?? 0);
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [profiles, userSearch, userFilter, userSort, userInvoiceCounts]);

  const usersPerPage = 10;
  const totalUserPages = Math.max(1, Math.ceil(filteredProfiles.length / usersPerPage));
  const paginatedProfiles = filteredProfiles.slice((userPage - 1) * usersPerPage, userPage * usersPerPage);

  const filteredInvoices = useMemo(() => {
    const q = invoiceSearch.trim().toLowerCase();
    if (!q) return invoices;
    return invoices.filter((i) =>
      [i.invoice_number, i.client_name, i.client_email, i.status, i.invoice_currency, i.base_currency]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [invoices, invoiceSearch]);

  const filteredTeam = useMemo(() => {
    const q = teamSearch.trim().toLowerCase();
    return team.filter((member) => {
      const matchesSearch = !q || [member.name, member.email, member.role, member.status, member.notes]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
      const matchesStatus = teamStatusFilter === "all" || member.status === teamStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [team, teamSearch, teamStatusFilter]);

  const selectedTeam = team.find((member) => member.id === selectedTeamId) ?? filteredTeam[0] ?? null;

  const teamStats = useMemo(() => ({
    total: team.length,
    active: team.filter((m) => m.status === "active").length,
    disabled: team.filter((m) => m.status === "disabled").length,
    fullAccess: team.filter((m) => m.role === "full_access").length,
  }), [team]);

  const metrics = useMemo(() => {
    const proUsers = profiles.filter((p) => p.is_pro || p.plan === "pro" || p.plan === "business").length;
    const freeUsers = profiles.length - proUsers;
    const paidInvoices = invoices.filter((i) => i.status === "paid").length;
    const overdueInvoices = invoices.filter((i) => i.status === "overdue").length;
    const invoiceRevenue = invoices
      .filter((i) => i.status === "paid")
      .reduce((sum, i) => sum + Number(i.base_total ?? i.total ?? 0), 0);
    const receivedFinance = finance
      .filter((entry) => entry.type === "income" && entry.status === "received")
      .reduce((sum, entry) => sum + Number(entry.amount), 0);
    const expenses = finance
      .filter((entry) => entry.type === "expense")
      .reduce((sum, entry) => sum + Number(entry.amount), 0);
    const receivable = finance
      .filter((entry) => entry.type === "receivable" || entry.status === "pending")
      .reduce((sum, entry) => sum + Number(entry.amount), 0);
    const adsRevenue = finance
      .filter((entry) => entry.source === "ads" && entry.status === "received")
      .reduce((sum, entry) => sum + Number(entry.amount), 0);

    return { proUsers, freeUsers, paidInvoices, overdueInvoices, invoiceRevenue, receivedFinance, expenses, receivable, adsRevenue };
  }, [profiles, invoices, finance]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto py-16 px-4">
        <Card className="p-8 text-center">
          <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-slate-900 mb-2">Access Denied</h1>
          <p className="text-sm text-slate-500 mb-4">You do not have permission to access the admin dashboard.</p>
          <p className="text-xs text-slate-400 mb-6">Admin access is restricted to {ADMIN_EMAIL}</p>
          <Link to="/" className="btn-primary">Back to Dashboard</Link>
        </Card>
      </div>
    );
  }

  async function updateProfile(profileId: string, updates: Partial<Profile> & Record<string, unknown>, action: string) {
    setError(null);
    setNotice(null);
    const { error: updateError } = await supabase.from("profiles").update(updates).eq("id", profileId);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    await logAction(action, "profile", profileId, updates);
    setNotice("User updated successfully.");
    await load();
  }


  async function handleSaveAdminNotes(profile: Profile) {
    await updateProfile(profile.id, { admin_notes: adminNotesDraft }, "save_admin_notes");
  }

  async function handleResetCredits(profile: Profile) {
    if (!window.confirm("Is user ke credits 0 karne hain?")) return;
    await updateProfile(profile.id, { credits: 0 }, "reset_credits");
  }

  async function handleRemoveFreePro(profile: Profile) {
    if (!window.confirm("Is user ka free Pro/Pro access remove karna hai?")) return;
    await updateProfile(profile.id, { is_pro: false, plan: "free", free_pro_until: null }, "remove_free_pro");
  }

  function exportUsersCsv() {
    const headers = ["Business", "Email", "Country", "Phone", "GSTIN", "Plan", "Credits", "Banned", "Invoices", "Joined"];
    const rows = paginatedProfiles.map((p) => {
      const authId = p.user_id || p.id;
      const values = [
        p.business_name || "",
        p.email || "",
        p.country || "",
        p.phone || "",
        p.gstin || "",
        p.is_pro || p.plan === "pro" || p.plan === "business" ? "Pro" : "Free",
        String(Number((p as unknown as { credits?: number }).credits ?? 0)),
        Boolean((p as unknown as { is_banned?: boolean }).is_banned) ? "Yes" : "No",
        String(userInvoiceCounts.get(authId) ?? 0),
        p.created_at,
      ];
      return values.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `invoicekit-users-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function handleBan(profile: Profile) {
    const reason = window.prompt("Ban reason?", "Violation of platform rules");
    if (reason === null) return;
    await updateProfile(profile.id, { is_banned: true, ban_reason: reason, banned_at: new Date().toISOString() }, "ban_user");
  }

  async function handleUnban(profile: Profile) {
    await updateProfile(profile.id, { is_banned: false, ban_reason: null, banned_at: null }, "unban_user");
  }

  async function handleGiveCredits(profile: Profile) {
    const amount = Number(window.prompt("Credits add karne ke liye number daalo", "10"));
    if (!Number.isFinite(amount) || amount <= 0) return;
    const current = Number((profile as unknown as { credits?: number }).credits ?? 0);
    await updateProfile(profile.id, { credits: current + amount }, "give_credits");
  }

  async function handleFreePro(profile: Profile) {
    const days = Number(window.prompt("Free Pro kitne din ke liye?", "30"));
    if (!Number.isFinite(days) || days <= 0) return;
    const until = new Date();
    until.setDate(until.getDate() + days);
    await updateProfile(profile.id, { is_pro: true, plan: "pro", free_pro_until: until.toISOString() }, "give_free_pro");
  }

  async function handleDeleteUserData(profile: Profile) {
    if (profile.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
      setError("Owner admin account delete nahi ho sakta.");
      return;
    }
    const authId = profile.user_id || profile.id;
    const confirmText = window.prompt(`Danger: ${profile.email || profile.business_name || "user"} ka profile, clients aur invoices delete honge. Confirm karne ke liye DELETE likho.`);
    if (confirmText !== "DELETE") return;
    setError(null);
    setNotice(null);

    const { error: invError } = await supabase.from("invoices").delete().eq("user_id", authId);
    if (invError) return setError(invError.message);
    const { error: clientError } = await supabase.from("clients").delete().eq("user_id", authId);
    if (clientError) return setError(clientError.message);
    const { error: subError } = await supabase.from("subscriptions").delete().eq("user_id", authId);
    if (subError && !subError.message.toLowerCase().includes("does not exist")) return setError(subError.message);
    const { error: profileError } = await supabase.from("profiles").delete().eq("id", profile.id);
    if (profileError) return setError(profileError.message);

    await logAction("delete_user_data", "profile", profile.id, { email: profile.email, user_id: authId });
    setSelectedUserId(null);
    setNotice("User data deleted. Auth user ko Supabase Authentication se manually delete karna hoga agar required hai.");
    await load();
  }

  async function handleAddTeam(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (!teamForm.email || !teamForm.password) {
      setError("Email and password required.");
      return;
    }

    try {
      const { data, error: fnError } = await supabase.functions.invoke("create-team-member", {
        body: teamForm,
      });

      if (fnError) {
        const { error: insertError } = await supabase.from("admin_team_members").insert({
          email: teamForm.email.toLowerCase(),
          name: teamForm.name || null,
          role: teamForm.role,
          temporary_password: teamForm.password,
          notes: teamForm.notes || "Edge Function not deployed yet. Deploy create-team-member for real Auth login.",
          created_by: user?.id ?? null,
        });
        if (insertError) throw insertError;
        setNotice("Team record created. Edge Function deploy karne ke baad real login create hoga.");
      } else {
        setNotice(data?.message ?? "Team member login created.");
      }

      await logAction("create_team_member", "admin_team_members", teamForm.email, { role: teamForm.role });
      setTeamForm({ name: "", email: "", password: "", role: "limited", notes: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create team member");
    }
  }

  async function toggleTeamStatus(member: AdminTeamMember) {
    const next = member.status === "active" ? "disabled" : "active";
    const { error: updateError } = await supabase.from("admin_team_members").update({ status: next }).eq("id", member.id);
    if (updateError) return setError(updateError.message);
    await logAction("update_team_status", "admin_team_members", member.id, { status: next });
    setNotice(`Team member ${next === "active" ? "enabled" : "disabled"}.`);
    await load();
  }

  async function updateTeamRole(member: AdminTeamMember, role: AdminTeamMember["role"]) {
    const { error: updateError } = await supabase.from("admin_team_members").update({ role }).eq("id", member.id);
    if (updateError) return setError(updateError.message);
    await logAction("update_team_role", "admin_team_members", member.id, { old_role: member.role, new_role: role });
    setNotice("Team role updated.");
    await load();
  }

  async function resetTeamTempPassword(member: AdminTeamMember) {
    const password = window.prompt(`New temporary password for ${member.email}`, generatePassword());
    if (!password || password.length < 6) return;
    const { error: updateError } = await supabase.from("admin_team_members").update({ temporary_password: password }).eq("id", member.id);
    if (updateError) return setError(updateError.message);
    await logAction("reset_team_temp_password", "admin_team_members", member.id, { email: member.email });
    setNotice("Temporary password saved in team record. Real Auth password reset ke liye Supabase Auth/Edge Function update needed hoga.");
    await load();
  }

  async function deleteTeamMember(member: AdminTeamMember) {
    const confirmText = window.prompt(`Delete team member ${member.email}? Confirm ke liye DELETE likho.`);
    if (confirmText !== "DELETE") return;
    const { error: deleteError } = await supabase.from("admin_team_members").delete().eq("id", member.id);
    if (deleteError) return setError(deleteError.message);
    await logAction("delete_team_member", "admin_team_members", member.id, { email: member.email });
    setSelectedTeamId(null);
    setNotice("Team member record deleted. Agar real Auth user bana tha to Supabase Authentication se disable/delete manually karo.");
    await load();
  }

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault();
    const { error: insertError } = await supabase.from("admin_tasks").insert({
      title: taskForm.title,
      description: taskForm.description || null,
      assigned_to: taskForm.assigned_to || null,
      priority: taskForm.priority,
      status: "pending",
      due_date: taskForm.due_date || null,
      created_by: user?.id ?? null,
    });
    if (insertError) return setError(insertError.message);
    await logAction("create_task", "admin_tasks", taskForm.title);
    setTaskForm({ title: "", description: "", assigned_to: "", priority: "medium", due_date: "" });
    setNotice("Task created.");
    await load();
  }

  async function updateTaskStatus(task: AdminTask, status: AdminTask["status"]) {
    const { error: updateError } = await supabase.from("admin_tasks").update({ status }).eq("id", task.id);
    if (updateError) return setError(updateError.message);
    await logAction("update_task_status", "admin_tasks", task.id, { status });
    await load();
  }

  async function handleAddFinance(e: React.FormEvent) {
    e.preventDefault();
    const { error: insertError } = await supabase.from("admin_finance_entries").insert({
      ...financeForm,
      amount: Number(financeForm.amount),
      created_by: user?.id ?? null,
    });
    if (insertError) return setError(insertError.message);
    await logAction("create_finance_entry", "admin_finance_entries", financeForm.title, { amount: financeForm.amount });
    setFinanceForm(emptyFormFinance());
    setNotice("Finance entry added.");
    await load();
  }

  const groupedSections = sections.reduce<Record<string, typeof sections>>((acc, item) => {
    acc[item.group] = acc[item.group] ?? [];
    acc[item.group].push(item);
    return acc;
  }, {});

  return (
    <div className="grid lg:grid-cols-[260px_1fr] gap-6 animate-fade-in">
      <aside className="lg:sticky lg:top-6 h-fit">
        <Card className="p-3 overflow-hidden">
          <div className="px-3 py-3 border-b border-slate-100 mb-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Admin Control</p>
            <p className="text-sm font-bold text-slate-900 mt-1">SaaS Management</p>
          </div>
          <nav className="space-y-4">
            {Object.entries(groupedSections).map(([group, items]) => (
              <div key={group}>
                <p className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{group}</p>
                <div className="space-y-1">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setActive(item.id)}
                      className={cx(
                        "w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition text-left",
                        active === item.id ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      )}
                    >
                      <span>{item.icon}</span>
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </Card>
      </aside>

      <main className="space-y-6 min-w-0">
        {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
        {notice && <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">{notice}</div>}
        {dataLoading ? <div className="card p-10 text-center text-sm text-slate-500">Loading admin data...</div> : null}

        {active === "dashboard" && (
          <section className="space-y-6">
            <SectionHeader title="Admin Dashboard" subtitle="Overview of users, plans, invoices, team work, and revenue" />
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              {[
                ["Total Users", profiles.length, "👥", "text-primary-600 bg-primary-50"],
                ["Pro Users", metrics.proUsers, "⭐", "text-amber-600 bg-amber-50"],
                ["Banned Users", profiles.filter((p) => (p as unknown as { is_banned?: boolean }).is_banned).length, "🚫", "text-red-600 bg-red-50"],
                ["Total Invoices", invoices.length, "📄", "text-blue-600 bg-blue-50"],
                ["Paid Invoices", metrics.paidInvoices, "✅", "text-green-600 bg-green-50"],
                ["Overdue", metrics.overdueInvoices, "⚠️", "text-red-600 bg-red-50"],
                ["Manual Revenue", formatMoney(metrics.receivedFinance, "INR"), "💰", "text-green-600 bg-green-50"],
                ["Expenses", formatMoney(metrics.expenses, "INR"), "💸", "text-slate-600 bg-slate-100"],
              ].map(([label, value, icon, color]) => (
                <Card key={String(label)} className="p-5">
                  <span className={cx("inline-flex w-10 h-10 rounded-xl items-center justify-center text-base font-bold mb-3", String(color))}>{icon}</span>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
                  <p className="text-xl font-bold text-slate-900 mt-1">{String(value)}</p>
                </Card>
              ))}
            </div>

            <div className="grid xl:grid-cols-2 gap-6">
              <Card>
                <div className="p-5 border-b border-slate-100 flex justify-between items-center">
                  <h2 className="text-lg font-semibold text-slate-900">Recent Users</h2>
                  <button className="text-sm text-primary-600 font-medium" onClick={() => setActive("users")}>Manage users</button>
                </div>
                <div className="divide-y divide-slate-100">
                  {profiles.slice(0, 5).map((p) => (
                    <div key={p.id} className="p-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">{p.business_name || p.email || "Unnamed"}</p>
                        <p className="text-xs text-slate-500">{p.country || "No country"} · {formatDate(p.created_at)}</p>
                      </div>
                      <Pill className={(p as unknown as { is_banned?: boolean }).is_banned ? statusClass("disabled") : p.is_pro ? "bg-amber-50 text-amber-700 border-amber-200" : statusClass("closed")}>
                        {(p as unknown as { is_banned?: boolean }).is_banned ? "Banned" : p.is_pro ? "Pro" : "Free"}
                      </Pill>
                    </div>
                  ))}
                </div>
              </Card>

              <Card>
                <div className="p-5 border-b border-slate-100 flex justify-between items-center">
                  <h2 className="text-lg font-semibold text-slate-900">Task Tracker</h2>
                  <button className="text-sm text-primary-600 font-medium" onClick={() => setActive("tasks")}>Open tasks</button>
                </div>
                <div className="divide-y divide-slate-100">
                  {tasks.length === 0 ? <p className="p-6 text-sm text-slate-500">No tasks yet.</p> : tasks.slice(0, 5).map((task) => (
                    <div key={task.id} className="p-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">{task.title}</p>
                        <p className="text-xs text-slate-500">{task.priority} priority {task.due_date ? `· Due ${task.due_date}` : ""}</p>
                      </div>
                      <Pill className={statusClass(task.status)}>{task.status.replace("_", " ")}</Pill>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </section>
        )}

        {active === "users" && (
          <section className="space-y-6">
            <SectionHeader title="User Management" subtitle="Search, filter, full user 360 detail, ban/unban, credits, free Pro aur notes" />

            <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
              <Metric title="Visible Users" value={String(filteredProfiles.length)} icon="👥" />
              <Metric title="Active" value={String(profiles.filter((p) => !(p as unknown as { is_banned?: boolean }).is_banned).length)} icon="✅" />
              <Metric title="Banned" value={String(profiles.filter((p) => (p as unknown as { is_banned?: boolean }).is_banned).length)} icon="🚫" />
              <Metric title="Pro" value={String(metrics.proUsers)} icon="⭐" />
              <Metric title="Free" value={String(metrics.freeUsers)} icon="🆓" />
            </div>

            <div className="grid xl:grid-cols-[1fr_460px] gap-6">
              <Card>
                <div className="p-5 border-b border-slate-100 space-y-4">
                  <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">All Users</h2>
                      <p className="text-sm text-slate-500">Click Details to manage user account.</p>
                    </div>
                    <button className="btn-secondary text-sm" onClick={exportUsersCsv}>Export CSV</button>
                  </div>
                  <div className="grid md:grid-cols-[1fr_160px_180px] gap-3">
                    <input className="input" placeholder="Search business, email, phone, GSTIN, country..." value={userSearch} onChange={(e) => setUserSearch(e.target.value)} />
                    <select className="input" value={userFilter} onChange={(e) => setUserFilter(e.target.value as typeof userFilter)}>
                      <option value="all">All users</option>
                      <option value="active">Active only</option>
                      <option value="banned">Banned only</option>
                      <option value="free">Free only</option>
                      <option value="pro">Pro only</option>
                    </select>
                    <select className="input" value={userSort} onChange={(e) => setUserSort(e.target.value as typeof userSort)}>
                      <option value="newest">Newest first</option>
                      <option value="oldest">Oldest first</option>
                      <option value="credits_high">Credits high to low</option>
                      <option value="invoices_high">Invoices high to low</option>
                    </select>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/50">
                        <th className="text-left text-xs font-semibold text-slate-500 uppercase px-5 py-3">Business</th>
                        <th className="text-left text-xs font-semibold text-slate-500 uppercase px-5 py-3">Plan</th>
                        <th className="text-left text-xs font-semibold text-slate-500 uppercase px-5 py-3 hidden md:table-cell">Credits</th>
                        <th className="text-left text-xs font-semibold text-slate-500 uppercase px-5 py-3 hidden lg:table-cell">Invoices</th>
                        <th className="text-left text-xs font-semibold text-slate-500 uppercase px-5 py-3 hidden xl:table-cell">Clients</th>
                        <th className="text-left text-xs font-semibold text-slate-500 uppercase px-5 py-3 hidden 2xl:table-cell">Joined</th>
                        <th className="text-right text-xs font-semibold text-slate-500 uppercase px-5 py-3">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredProfiles.length === 0 ? (
                        <tr><td colSpan={7} className="p-8 text-center text-sm text-slate-500">No users found.</td></tr>
                      ) : paginatedProfiles.map((p) => {
                        const authId = p.user_id || p.id;
                        const isBanned = Boolean((p as unknown as { is_banned?: boolean }).is_banned);
                        const isPro = Boolean(p.is_pro || p.plan === "pro" || p.plan === "business");
                        return (
                          <tr key={p.id} className={cx("hover:bg-slate-50/50 transition", selectedUser?.id === p.id && "bg-primary-50/50")}>
                            <td className="px-5 py-3.5">
                              <p className="font-medium text-slate-900">{p.business_name || "Unnamed"}</p>
                              <p className="text-xs text-slate-500">{p.email || "No email"}</p>
                              <p className="text-xs text-slate-400">{p.country || "No country"} {p.phone ? `· ${p.phone}` : ""}</p>
                            </td>
                            <td className="px-5 py-3.5"><Pill className={isBanned ? statusClass("disabled") : isPro ? "bg-amber-50 text-amber-700 border-amber-200" : statusClass("closed")}>{isBanned ? "Banned" : isPro ? "Pro" : "Free"}</Pill></td>
                            <td className="px-5 py-3.5 text-sm text-slate-600 hidden md:table-cell">{Number((p as unknown as { credits?: number }).credits ?? 0)}</td>
                            <td className="px-5 py-3.5 text-sm text-slate-600 hidden lg:table-cell">{userInvoiceCounts.get(authId) ?? 0}</td>
                            <td className="px-5 py-3.5 text-sm text-slate-600 hidden xl:table-cell">{userClientCounts.get(authId) ?? 0}</td>
                            <td className="px-5 py-3.5 text-sm text-slate-500 hidden 2xl:table-cell">{formatDate(p.created_at)}</td>
                            <td className="px-5 py-3.5 text-right">
                              <button className="btn-secondary text-xs py-1.5 px-3" onClick={() => setSelectedUserId(p.id)}>Details</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-5 py-4 border-t border-slate-100 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                  <p className="text-sm text-slate-500">Showing {filteredProfiles.length === 0 ? 0 : (userPage - 1) * usersPerPage + 1}-{Math.min(userPage * usersPerPage, filteredProfiles.length)} of {filteredProfiles.length}</p>
                  <div className="flex items-center gap-2">
                    <button className="btn-secondary text-xs py-1.5 px-3" disabled={userPage <= 1} onClick={() => setUserPage((p) => Math.max(1, p - 1))}>Previous</button>
                    <span className="text-sm text-slate-600">Page {userPage} / {totalUserPages}</span>
                    <button className="btn-secondary text-xs py-1.5 px-3" disabled={userPage >= totalUserPages} onClick={() => setUserPage((p) => Math.min(totalUserPages, p + 1))}>Next</button>
                  </div>
                </div>
              </Card>

              <Card className="p-5 h-fit xl:sticky xl:top-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">User 360 Detail</h2>
                {selectedUser ? (
                  <div className="space-y-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xl font-bold text-slate-900">{selectedUser.business_name || "Unnamed Business"}</p>
                        <p className="text-sm text-slate-500">{selectedUser.email || "No email"}</p>
                      </div>
                      <Pill className={(selectedUser as unknown as { is_banned?: boolean }).is_banned ? statusClass("disabled") : selectedUser.is_pro ? "bg-amber-50 text-amber-700 border-amber-200" : statusClass("closed")}>
                        {(selectedUser as unknown as { is_banned?: boolean }).is_banned ? "Banned" : selectedUser.is_pro ? "Pro" : "Free"}
                      </Pill>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <Info label="Country" value={selectedUser.country || "—"} />
                      <Info label="Phone" value={selectedUser.phone || "—"} />
                      <Info label="GSTIN" value={selectedUser.gstin || "—"} />
                      <Info label="Currency" value={selectedUser.currency || "—"} />
                      <Info label="Invoices" value={String(selectedUserInvoices.length)} />
                      <Info label="Clients" value={String(selectedUserClients.length)} />
                      <Info label="Revenue" value={formatMoney(selectedUserInvoiceRevenue, selectedUser.currency || "INR")} />
                      <Info label="Credits" value={String(Number((selectedUser as unknown as { credits?: number }).credits ?? 0))} />
                      <Info label="Joined" value={formatDate(selectedUser.created_at)} />
                      <Info label="Free Pro Until" value={String((selectedUser as unknown as { free_pro_until?: string | null }).free_pro_until ? formatDate(String((selectedUser as unknown as { free_pro_until?: string }).free_pro_until)) : "—")} />
                    </div>

                    {(selectedUser as unknown as { ban_reason?: string | null }).ban_reason && (
                      <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                        Ban reason: {(selectedUser as unknown as { ban_reason?: string | null }).ban_reason}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <button className="btn-secondary" onClick={() => handleGiveCredits(selectedUser)}>Give Credits</button>
                      <button className="btn-secondary" onClick={() => handleResetCredits(selectedUser)}>Reset Credits</button>
                      <button className="btn-primary" onClick={() => handleFreePro(selectedUser)}>Give Free Pro</button>
                      <button className="btn-secondary" onClick={() => handleRemoveFreePro(selectedUser)}>Remove Pro</button>
                      {(selectedUser as unknown as { is_banned?: boolean }).is_banned ? (
                        <button className="btn-primary col-span-2" onClick={() => handleUnban(selectedUser)}>Unban User</button>
                      ) : (
                        <button className="col-span-2 rounded-lg bg-red-600 text-white px-4 py-2 text-sm font-semibold hover:bg-red-700" onClick={() => handleBan(selectedUser)}>Ban User</button>
                      )}
                      <button className="col-span-2 rounded-lg bg-red-50 text-red-700 border border-red-200 px-4 py-2 text-sm font-semibold hover:bg-red-100" onClick={() => handleDeleteUserData(selectedUser)}>Delete User Data</button>
                    </div>

                    <div>
                      <label className="text-sm font-semibold text-slate-900 mb-2 block">Admin Notes</label>
                      <textarea className="input min-h-24" placeholder="Internal notes for this user..." value={adminNotesDraft} onChange={(e) => setAdminNotesDraft(e.target.value)} />
                      <button className="btn-secondary mt-2 w-full" onClick={() => handleSaveAdminNotes(selectedUser)}>Save Notes</button>
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <p className="text-sm font-semibold text-slate-900">Invoice History</p>
                        <select className="input text-xs py-1.5 max-w-32" value={selectedInvoiceStatus} onChange={(e) => setSelectedInvoiceStatus(e.target.value as typeof selectedInvoiceStatus)}>
                          <option value="all">All</option>
                          <option value="draft">Draft</option>
                          <option value="sent">Sent</option>
                          <option value="paid">Paid</option>
                          <option value="overdue">Overdue</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-4 gap-2 mb-3">
                        {(["draft", "sent", "paid", "overdue"] as const).map((status) => (
                          <div key={status} className="rounded-lg bg-slate-50 border border-slate-100 p-2 text-center">
                            <p className="text-xs text-slate-500 capitalize">{status}</p>
                            <p className="text-sm font-bold text-slate-900">{selectedUserInvoices.filter((inv) => inv.status === status).length}</p>
                          </div>
                        ))}
                      </div>
                      <div className="space-y-2 max-h-72 overflow-auto pr-1">
                        {selectedStatusInvoices.slice(0, 10).map((inv) => (
                          <div key={inv.id} className="rounded-lg border border-slate-100 p-3 flex justify-between items-center gap-3">
                            <div>
                              <p className="text-sm font-medium text-slate-900">{inv.invoice_number}</p>
                              <p className="text-xs text-slate-500">{inv.client_name} · {formatDate(inv.created_at)}</p>
                              <p className="text-[11px] text-slate-400">Due: {formatDate(inv.due_date)}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold">{formatMoney(Number(inv.invoice_total ?? inv.total), inv.invoice_currency || selectedUser.currency || "INR")}</p>
                              <StatusBadge status={inv.status} />
                            </div>
                          </div>
                        ))}
                        {selectedStatusInvoices.length === 0 && <p className="text-sm text-slate-500">No invoices for this filter.</p>}
                      </div>
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-slate-900 mb-2">Activity Timeline</p>
                      <div className="space-y-2">
                        <TimelineItem label="Account created" date={selectedUser.created_at} />
                        {selectedUserInvoices.slice(0, 3).map((inv) => (
                          <TimelineItem key={inv.id} label={`Invoice ${inv.invoice_number} created`} date={inv.created_at} />
                        ))}
                        {(selectedUser as unknown as { banned_at?: string | null }).banned_at && <TimelineItem label="User banned" date={String((selectedUser as unknown as { banned_at?: string }).banned_at)} />}
                      </div>
                    </div>
                  </div>
                ) : <p className="text-sm text-slate-500">Select a user.</p>}
              </Card>
            </div>
          </section>
        )}

        {active === "credits" && (
          <section className="space-y-6">
            <SectionHeader title="Credits & Plans" subtitle="Manual credits, free Pro access aur plan override yahan se control karo" />
            <Card>
              <div className="p-5 border-b border-slate-100"><h2 className="text-lg font-semibold text-slate-900">Quick Actions</h2></div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr className="border-b border-slate-100 bg-slate-50/50"><th className="text-left text-xs font-semibold text-slate-500 uppercase px-5 py-3">User</th><th className="text-left text-xs font-semibold text-slate-500 uppercase px-5 py-3">Plan</th><th className="text-left text-xs font-semibold text-slate-500 uppercase px-5 py-3">Credits</th><th className="text-right text-xs font-semibold text-slate-500 uppercase px-5 py-3">Actions</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {profiles.map((p) => <tr key={p.id}><td className="px-5 py-3.5"><p className="font-medium text-slate-900">{p.business_name || "Unnamed"}</p><p className="text-xs text-slate-500">{p.email}</p></td><td className="px-5 py-3.5"><Pill className={p.is_pro ? "bg-amber-50 text-amber-700 border-amber-200" : statusClass("closed")}>{p.is_pro ? "Pro" : "Free"}</Pill></td><td className="px-5 py-3.5 font-semibold">{Number((p as unknown as { credits?: number }).credits ?? 0)}</td><td className="px-5 py-3.5 text-right space-x-2"><button className="btn-secondary text-xs py-1.5 px-3" onClick={() => handleGiveCredits(p)}>Add Credits</button><button className="btn-primary text-xs py-1.5 px-3" onClick={() => handleFreePro(p)}>Give Free Pro</button></td></tr>)}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>
        )}

        {active === "team" && (
          <section className="space-y-6">
            <SectionHeader title="Manage Team Members" subtitle="Team login, role, permission, status aur task workload control karo" />
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <Metric title="Total Members" value={String(teamStats.total)} icon="👨‍💼" />
              <Metric title="Active" value={String(teamStats.active)} icon="✅" />
              <Metric title="Disabled" value={String(teamStats.disabled)} icon="🚫" />
              <Metric title="Full Access" value={String(teamStats.fullAccess)} icon="🔐" />
            </div>

            <div className="grid xl:grid-cols-[430px_1fr] gap-6">
              <Card className="p-5 h-fit">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Create Team Login</h2>
                    <p className="text-sm text-slate-500">Email/password se team member record aur Supabase login create hoga.</p>
                  </div>
                </div>
                <form onSubmit={handleAddTeam} className="space-y-3">
                  <input className="input" placeholder="Full name" value={teamForm.name} onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })} />
                  <input className="input" type="email" placeholder="Email" value={teamForm.email} onChange={(e) => setTeamForm({ ...teamForm, email: e.target.value })} />
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <input className="input" type="text" placeholder="Temporary password" value={teamForm.password} onChange={(e) => setTeamForm({ ...teamForm, password: e.target.value })} />
                    <button type="button" className="btn-secondary whitespace-nowrap" onClick={() => setTeamForm({ ...teamForm, password: generatePassword() })}>Generate</button>
                  </div>
                  <select className="input" value={teamForm.role} onChange={(e) => setTeamForm({ ...teamForm, role: e.target.value })}>
                    <option value="limited">Limited</option>
                    <option value="full_access">Full Access</option>
                    <option value="support">Support</option>
                    <option value="finance">Finance</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Role Access Preview</p>
                    <div className="flex flex-wrap gap-2">
                      {roleAccess[teamForm.role as AdminTeamMember["role"]].map((item) => <Pill key={item} className="bg-white text-slate-700 border-slate-200">{item}</Pill>)}
                    </div>
                  </div>
                  <textarea className="input min-h-24" placeholder="Notes / responsibility" value={teamForm.notes} onChange={(e) => setTeamForm({ ...teamForm, notes: e.target.value })} />
                  <button className="btn-primary w-full" type="submit">Create Team Member</button>
                </form>
                <p className="text-xs text-slate-500 mt-3">Real auth login ke liye Supabase Edge Function <b>create-team-member</b> deploy hona chahiye. Function fail hua to safe fallback team record create karega.</p>
              </Card>

              <div className="space-y-6">
                <Card>
                  <div className="p-5 border-b border-slate-100 flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">Team Members</h2>
                      <p className="text-sm text-slate-500">Search, role update, disable/enable, reset temp password.</p>
                    </div>
                    <div className="flex gap-2">
                      <input className="input w-64" placeholder="Search member, email, role..." value={teamSearch} onChange={(e) => setTeamSearch(e.target.value)} />
                      <select className="input w-36" value={teamStatusFilter} onChange={(e) => setTeamStatusFilter(e.target.value as "all" | "active" | "disabled")}>
                        <option value="all">All</option>
                        <option value="active">Active</option>
                        <option value="disabled">Disabled</option>
                      </select>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/50">
                          <th className="text-left text-xs font-semibold text-slate-500 uppercase px-5 py-3">Member</th>
                          <th className="text-left text-xs font-semibold text-slate-500 uppercase px-5 py-3">Role</th>
                          <th className="text-left text-xs font-semibold text-slate-500 uppercase px-5 py-3">Status</th>
                          <th className="text-left text-xs font-semibold text-slate-500 uppercase px-5 py-3">Created</th>
                          <th className="text-right text-xs font-semibold text-slate-500 uppercase px-5 py-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredTeam.length === 0 ? (
                          <tr><td colSpan={5} className="p-8 text-center text-sm text-slate-500">No team members found.</td></tr>
                        ) : filteredTeam.map((m) => (
                          <tr key={m.id} className={cx("hover:bg-slate-50/60 transition", selectedTeam?.id === m.id && "bg-primary-50/40")}>
                            <td className="px-5 py-3.5">
                              <button className="text-left" onClick={() => setSelectedTeamId(m.id)}>
                                <p className="font-medium text-slate-900">{m.name || m.email}</p>
                                <p className="text-xs text-slate-500">{m.email}</p>
                              </button>
                            </td>
                            <td className="px-5 py-3.5">
                              <select className="input text-xs py-1.5" value={m.role} onChange={(e) => updateTeamRole(m, e.target.value as AdminTeamMember["role"])}>
                                <option value="limited">Limited</option>
                                <option value="full_access">Full Access</option>
                                <option value="support">Support</option>
                                <option value="finance">Finance</option>
                                <option value="viewer">Viewer</option>
                              </select>
                            </td>
                            <td className="px-5 py-3.5"><Pill className={statusClass(m.status)}>{m.status}</Pill></td>
                            <td className="px-5 py-3.5 text-sm text-slate-500">{formatDate(m.created_at)}</td>
                            <td className="px-5 py-3.5 text-right space-x-2 whitespace-nowrap">
                              <button className="btn-secondary text-xs py-1.5 px-3" onClick={() => setSelectedTeamId(m.id)}>Details</button>
                              <button className="btn-secondary text-xs py-1.5 px-3" onClick={() => toggleTeamStatus(m)}>{m.status === "active" ? "Disable" : "Enable"}</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>

                <Card className="p-5">
                  <h2 className="text-lg font-semibold text-slate-900 mb-4">Team Member 360</h2>
                  {selectedTeam ? (
                    <div className="space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xl font-bold text-slate-900">{selectedTeam.name || selectedTeam.email}</p>
                          <p className="text-sm text-slate-500">{selectedTeam.email}</p>
                        </div>
                        <Pill className={statusClass(selectedTeam.status)}>{selectedTeam.status}</Pill>
                      </div>
                      <div className="grid md:grid-cols-2 gap-3">
                        <Info label="Role" value={roleLabels[selectedTeam.role]} />
                        <Info label="Created" value={formatDate(selectedTeam.created_at)} />
                        <Info label="Auth User" value={selectedTeam.auth_user_id ? "Created" : "Not linked"} />
                        <Info label="Temp Password" value={selectedTeam.temporary_password || "—"} />
                      </div>
                      <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
                        <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Allowed Modules</p>
                        <div className="flex flex-wrap gap-2">
                          {roleAccess[selectedTeam.role].map((item) => <Pill key={item} className="bg-white text-slate-700 border-slate-200">{item}</Pill>)}
                        </div>
                      </div>
                      {selectedTeam.notes && <div className="rounded-xl bg-slate-50 border border-slate-100 p-4"><p className="text-xs text-slate-500 mb-1">Notes</p><p className="text-sm text-slate-700 whitespace-pre-wrap">{selectedTeam.notes}</p></div>}
                      <div className="grid md:grid-cols-3 gap-2">
                        <button className="btn-secondary" onClick={() => resetTeamTempPassword(selectedTeam)}>Reset Temp Password</button>
                        <button className="btn-secondary" onClick={() => toggleTeamStatus(selectedTeam)}>{selectedTeam.status === "active" ? "Disable Access" : "Enable Access"}</button>
                        <button className="rounded-lg bg-red-50 text-red-700 border border-red-200 px-4 py-2 text-sm font-semibold hover:bg-red-100" onClick={() => deleteTeamMember(selectedTeam)}>Delete Record</button>
                      </div>
                    </div>
                  ) : <p className="text-sm text-slate-500">Select a team member.</p>}
                </Card>
              </div>
            </div>
          </section>
        )}

        {active === "tasks" && (
          <section className="space-y-6">
            <SectionHeader title="Tasks" subtitle="Team ko kaam assign karo aur status track karo" />
            <div className="grid xl:grid-cols-[420px_1fr] gap-6">
              <Card className="p-5 h-fit"><h2 className="text-lg font-semibold text-slate-900 mb-4">Assign New Task</h2><form onSubmit={handleAddTask} className="space-y-3"><input className="input" required placeholder="Task title" value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} /><textarea className="input min-h-24" placeholder="Description" value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} /><select className="input" value={taskForm.assigned_to} onChange={(e) => setTaskForm({ ...taskForm, assigned_to: e.target.value })}><option value="">Unassigned</option>{team.map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}</select><select className="input" value={taskForm.priority} onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select><input className="input" type="date" value={taskForm.due_date} onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })} /><button className="btn-primary w-full" type="submit">Create Task</button></form></Card>
              <Card><div className="p-5 border-b border-slate-100"><h2 className="text-lg font-semibold text-slate-900">Task Board</h2></div><div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4 p-4">{(["pending", "in_progress", "blocked", "done"] as AdminTask["status"][]).map((status) => <div key={status} className="rounded-xl bg-slate-50 border border-slate-100 p-3"><p className="text-sm font-bold text-slate-700 capitalize mb-3">{status.replace("_", " ")}</p><div className="space-y-2">{tasks.filter((t) => t.status === status).map((task) => <div key={task.id} className="rounded-lg bg-white border border-slate-100 p-3"><p className="font-medium text-sm text-slate-900">{task.title}</p><p className="text-xs text-slate-500 mt-1">{task.priority} {task.due_date ? `· ${task.due_date}` : ""}</p><select className="input mt-2 text-xs py-1.5" value={task.status} onChange={(e) => updateTaskStatus(task, e.target.value as AdminTask["status"])}><option value="pending">Pending</option><option value="in_progress">In Progress</option><option value="blocked">Blocked</option><option value="done">Done</option></select></div>)}{tasks.filter((t) => t.status === status).length === 0 && <p className="text-xs text-slate-400">No tasks</p>}</div></div>)}</div></Card>
            </div>
          </section>
        )}

        {active === "finance" && (
          <section className="space-y-6">
            <SectionHeader title="Revenue & Finance" subtitle="Manual revenue, ads income, expenses, receivables aur balance track karo" />
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <Metric title="Received" value={formatMoney(metrics.receivedFinance, "INR")} icon="💰" />
              <Metric title="Ads Revenue" value={formatMoney(metrics.adsRevenue, "INR")} icon="📢" />
              <Metric title="Pending/Receivable" value={formatMoney(metrics.receivable, "INR")} icon="⏳" />
              <Metric title="Net Balance" value={formatMoney(metrics.receivedFinance - metrics.expenses, "INR")} icon="🏦" />
            </div>
            <div className="grid xl:grid-cols-[420px_1fr] gap-6">
              <Card className="p-5 h-fit"><h2 className="text-lg font-semibold text-slate-900 mb-4">Add Finance Entry</h2><form onSubmit={handleAddFinance} className="space-y-3"><input className="input" type="date" value={financeForm.entry_date} onChange={(e) => setFinanceForm({ ...financeForm, entry_date: e.target.value })} /><input className="input" required placeholder="Title" value={financeForm.title} onChange={(e) => setFinanceForm({ ...financeForm, title: e.target.value })} /><div className="grid grid-cols-2 gap-2"><select className="input" value={financeForm.type} onChange={(e) => setFinanceForm({ ...financeForm, type: e.target.value as AdminFinanceEntry["type"] })}><option value="income">Income</option><option value="expense">Expense</option><option value="receivable">Receivable</option></select><select className="input" value={financeForm.source} onChange={(e) => setFinanceForm({ ...financeForm, source: e.target.value as AdminFinanceEntry["source"] })}><option value="manual">Manual</option><option value="subscription">Subscription</option><option value="ads">Ads</option><option value="invoice">Invoice</option><option value="other">Other</option></select></div><div className="grid grid-cols-[1fr_90px] gap-2"><input className="input" type="number" min="0" step="0.01" value={financeForm.amount} onChange={(e) => setFinanceForm({ ...financeForm, amount: Number(e.target.value) })} /><input className="input" value={financeForm.currency} onChange={(e) => setFinanceForm({ ...financeForm, currency: e.target.value.toUpperCase() })} /></div><select className="input" value={financeForm.status} onChange={(e) => setFinanceForm({ ...financeForm, status: e.target.value as AdminFinanceEntry["status"] })}><option value="received">Received</option><option value="pending">Pending</option><option value="spent">Spent</option></select><textarea className="input min-h-20" placeholder="Notes" value={financeForm.notes ?? ""} onChange={(e) => setFinanceForm({ ...financeForm, notes: e.target.value })} /><button className="btn-primary w-full" type="submit">Add Entry</button></form></Card>
              <Card><div className="p-5 border-b border-slate-100"><h2 className="text-lg font-semibold text-slate-900">Finance Ledger</h2></div><div className="overflow-x-auto"><table className="w-full"><thead><tr className="border-b border-slate-100 bg-slate-50/50"><th className="text-left text-xs font-semibold text-slate-500 uppercase px-5 py-3">Date</th><th className="text-left text-xs font-semibold text-slate-500 uppercase px-5 py-3">Title</th><th className="text-left text-xs font-semibold text-slate-500 uppercase px-5 py-3">Source</th><th className="text-right text-xs font-semibold text-slate-500 uppercase px-5 py-3">Amount</th></tr></thead><tbody className="divide-y divide-slate-100">{finance.length === 0 ? <tr><td colSpan={4} className="p-8 text-center text-sm text-slate-500">No finance entries yet.</td></tr> : finance.map((entry) => <tr key={entry.id}><td className="px-5 py-3.5 text-sm text-slate-500">{entry.entry_date}</td><td className="px-5 py-3.5"><p className="font-medium text-slate-900">{entry.title}</p><Pill className={statusClass(entry.status)}>{entry.status}</Pill></td><td className="px-5 py-3.5 text-sm text-slate-600 capitalize">{entry.source}</td><td className={cx("px-5 py-3.5 text-right font-bold", entry.type === "expense" ? "text-red-600" : "text-green-600")}>{entry.type === "expense" ? "-" : "+"}{formatMoney(Number(entry.amount), entry.currency)}</td></tr>)}</tbody></table></div></Card>
            </div>
          </section>
        )}

        {active === "invoices" && (
          <section className="space-y-6">
            <SectionHeader title="All Invoices" subtitle="Saare users ki invoices search/filter karo" />
            <Card>
              <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between"><h2 className="text-lg font-semibold text-slate-900">Invoices</h2><input className="input sm:w-80" placeholder="Search invoice, client, status..." value={invoiceSearch} onChange={(e) => setInvoiceSearch(e.target.value)} /></div>
              <div className="overflow-x-auto"><table className="w-full"><thead><tr className="border-b border-slate-100 bg-slate-50/50"><th className="text-left text-xs font-semibold text-slate-500 uppercase px-5 py-3">Invoice #</th><th className="text-left text-xs font-semibold text-slate-500 uppercase px-5 py-3">Client</th><th className="text-left text-xs font-semibold text-slate-500 uppercase px-5 py-3">Amount</th><th className="text-left text-xs font-semibold text-slate-500 uppercase px-5 py-3">Status</th><th className="text-left text-xs font-semibold text-slate-500 uppercase px-5 py-3">Date</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredInvoices.length === 0 ? <tr><td colSpan={5} className="p-8 text-center text-sm text-slate-500">No invoices found</td></tr> : filteredInvoices.map((inv) => <tr key={inv.id} className="hover:bg-slate-50/50 transition"><td className="px-5 py-3.5 font-medium text-slate-900">{inv.invoice_number}</td><td className="px-5 py-3.5 text-sm text-slate-700">{inv.client_name}</td><td className="px-5 py-3.5 text-sm font-semibold text-slate-900">{formatMoney(Number(inv.invoice_total ?? inv.total), inv.invoice_currency || inv.base_currency || "INR")}</td><td className="px-5 py-3.5"><StatusBadge status={inv.status} /></td><td className="px-5 py-3.5 text-sm text-slate-500">{formatDate(inv.created_at)}</td></tr>)}</tbody></table></div>
            </Card>
          </section>
        )}

        {active === "analytics" && (
          <Placeholder title="Analytics" subtitle="Growth, invoices, revenue aur user activity insights" items={["User growth tracking", "Invoice status breakdown", "Revenue source summary", "Plan conversion monitoring"]} />
        )}
        {active === "support" && (
          <section className="space-y-6"><SectionHeader title="Support Tickets" subtitle="User complaints/issues yahan track honge" /><Card><div className="p-5 border-b border-slate-100"><h2 className="text-lg font-semibold text-slate-900">Tickets</h2></div><div className="divide-y divide-slate-100">{supportTickets.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No support tickets yet. Table ready hai, frontend form next phase me user side pe add hoga.</p> : supportTickets.map((t) => <div key={t.id} className="p-5 flex items-center justify-between"><div><p className="font-medium text-slate-900">{t.subject}</p><p className="text-sm text-slate-500">{t.message || "No message"}</p></div><Pill className={statusClass(t.status)}>{t.status}</Pill></div>)}</div></Card></section>
        )}
        {active === "audit" && (
          <section className="space-y-6"><SectionHeader title="Audit Logs" subtitle="Admin actions ka security history" /><Card><div className="overflow-x-auto"><table className="w-full"><thead><tr className="border-b border-slate-100 bg-slate-50/50"><th className="text-left text-xs font-semibold text-slate-500 uppercase px-5 py-3">Time</th><th className="text-left text-xs font-semibold text-slate-500 uppercase px-5 py-3">Action</th><th className="text-left text-xs font-semibold text-slate-500 uppercase px-5 py-3">Target</th></tr></thead><tbody className="divide-y divide-slate-100">{auditLogs.length === 0 ? <tr><td colSpan={3} className="p-8 text-center text-sm text-slate-500">No audit logs yet.</td></tr> : auditLogs.map((log) => <tr key={log.id}><td className="px-5 py-3.5 text-sm text-slate-500">{formatDate(log.created_at)}</td><td className="px-5 py-3.5 font-medium text-slate-900">{log.action}</td><td className="px-5 py-3.5 text-sm text-slate-600">{log.target_type || "—"} {log.target_id || ""}</td></tr>)}</tbody></table></div></Card></section>
        )}
        {active === "settings" && (
          <Placeholder title="Admin Settings" subtitle="Owner email, permissions aur platform controls" items={[`Owner admin: ${ADMIN_EMAIL}`, "Reserved admin email signup block active", "Team roles: Full Access, Limited, Support, Finance, Viewer", "Future: Razorpay/Stripe keys, ads settings, plan limits"]} />
        )}
      </main>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-slate-50 border border-slate-100 p-3"><p className="text-xs text-slate-500">{label}</p><p className="font-semibold text-slate-900 break-words">{value}</p></div>;
}

function TimelineItem({ label, date }: { label: string; date: string }) {
  return (
    <div className="flex gap-3 text-sm">
      <div className="mt-1.5 w-2 h-2 rounded-full bg-primary-500 shrink-0" />
      <div>
        <p className="text-slate-800 font-medium">{label}</p>
        <p className="text-xs text-slate-500">{formatDate(date)}</p>
      </div>
    </div>
  );
}

function Metric({ title, value, icon }: { title: string; value: string; icon: string }) {
  return <Card className="p-5"><span className="inline-flex w-10 h-10 rounded-xl items-center justify-center text-base bg-primary-50 text-primary-700 mb-3">{icon}</span><p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{title}</p><p className="text-xl font-bold text-slate-900 mt-1">{value}</p></Card>;
}

function Placeholder({ title, subtitle, items }: { title: string; subtitle: string; items: string[] }) {
  return <section className="space-y-6"><SectionHeader title={title} subtitle={subtitle} /><Card className="p-6"><div className="grid md:grid-cols-2 gap-4">{items.map((item) => <div key={item} className="rounded-xl border border-slate-100 bg-slate-50 p-4"><p className="font-medium text-slate-900">{item}</p><p className="text-sm text-slate-500 mt-1">Ready for next production phase.</p></div>)}</div></Card></section>;
}
