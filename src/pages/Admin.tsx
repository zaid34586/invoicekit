import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { ADMIN_EMAIL, FREE_PLAN_LIMIT, formatDate } from "../lib/constants";
import { formatMoney } from "../lib/currency";
import type { Profile, Invoice, Client } from "../lib/types";
import StatusBadge from "../components/StatusBadge";
import AdminSubscriptionManager from "../components/AdminSubscriptionManager";
import CommunicationCenter from "../components/CommunicationCenter";
import AdminPaddleSettings from "../components/AdminPaddleSettings";
import AdminGrowthCenter from "../components/AdminGrowthCenter";
import AdminSubscriptionAutomation from "../components/AdminSubscriptionAutomation";
import AdminSupportCenter from "../components/AdminSupportCenter";
import AdminBillingRecovery from "../components/AdminBillingRecovery";
import AdminSystemMonitor from "../components/AdminSystemMonitor";
import AdminSecurityCenter from "../components/AdminSecurityCenter";
import AdminProductionQA from "../components/AdminProductionQA";
import AdminOperationsCommand from "../components/AdminOperationsCommand";
import AdminUnifiedKPI from "../components/AdminUnifiedKPI";
import AdminTeamWorkload from "../components/AdminTeamWorkload";
import AdminRevenueIntelligence from "../components/AdminRevenueIntelligence";
import AdminCustomerSuccess from "../components/AdminCustomerSuccess";
import AdminAccessGovernance from "../components/AdminAccessGovernance";

type AdminSection =
  | "dashboard"
  | "users"
  | "credits"
  | "subscriptions"
  | "growth"
  | "paddle"
  | "subscriptionAutomation"
  | "billingRecovery"
  | "team"
  | "tasks"
  | "communication"
  | "finance"
  | "invoices"
  | "analytics"
  | "support"
  | "audit"
  | "system"
  | "qa"
  | "settings";

type AdminTeamMember = {
  id: string;
  auth_user_id: string | null;
  email: string;
  name: string | null;
  role: "full_access" | "standard" | "limited" | "support" | "finance" | "viewer";
  department?: string | null;
  status: "active" | "disabled";
  temporary_password: string | null;
  notes: string | null;
  invite_status?: "sent" | "failed" | "not_configured" | null;
  invite_email_sent_at?: string | null;
  invite_error?: string | null;
  staff_portal_url?: string | null;
  created_at: string;
};

type AdminTask = {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  department: "general" | "support" | "finance" | "sales" | "engineering" | "marketing" | "hr" | "legal";
  priority: "low" | "medium" | "high" | "urgent";
  status: "pending" | "in_progress" | "done" | "blocked";
  progress: number;
  due_date: string | null;
  internal_notes: string | null;
  staff_notes?: string | null;
  last_staff_update?: string | null;
  completed_at?: string | null;
  origin?: "manual" | "auto" | "chat" | null;
  rule_id?: string | null;
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
  assigned_to: string | null;
  internal_notes: string | null;
  staff_notes?: string | null;
  last_staff_update?: string | null;
  completed_at?: string | null;
  created_at: string;
};

type AdminSupportMessage = {
  id: string;
  ticket_id: string;
  author_type: "customer" | "staff" | "admin";
  message: string;
  is_internal: boolean;
  created_at: string;
};
type AdminSupportAttachment = { id: string; ticket_id: string; file_name: string; storage_path: string; signed_url?: string; };

type InvoiceBalanceModalState = {
  profile: Profile;
  amount: string;
  reason: string;
} | null;

type FreeProModalState = {
  profile: Profile;
  days: string;
  reason: string;
  plan: "pro" | "business";
} | null;

type AdminSystemSettings = {
  maintenance_mode: boolean;
  maintenance_message: string;
  allow_admin_bypass: boolean;
  public_signup: boolean;
  invoice_sharing: boolean;
  credits_system: boolean;
  team_portal: boolean;
  ai_insights: boolean;
  ads_enabled: boolean;
  default_currency: string;
  security_level: "standard" | "strict" | "locked";
};

const DEFAULT_SYSTEM_SETTINGS: AdminSystemSettings = {
  maintenance_mode: false,
  maintenance_message: "We are improving Rivox. Please check back soon.",
  allow_admin_bypass: true,
  public_signup: true,
  invoice_sharing: true,
  credits_system: true,
  team_portal: false,
  ai_insights: true,
  ads_enabled: false,
  default_currency: "INR",
  security_level: "standard",
};

const sections: { id: AdminSection; label: string; icon: string; group: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "📊", group: "Overview" },
  { id: "users", label: "Users", icon: "👥", group: "Users" },
  { id: "credits", label: "Invoice Balance & Plans", icon: "💳", group: "Users" },
  { id: "subscriptions", label: "Plans & Pricing", icon: "💳", group: "Money" },
  { id: "growth", label: "Growth Center", icon: "🚀", group: "Money" },
  { id: "paddle", label: "Paddle & API Key", icon: "🔐", group: "Money" },
  { id: "subscriptionAutomation", label: "Subscription Automation", icon: "🔁", group: "Money" },
  { id: "billingRecovery", label: "Activation Recovery", icon: "⚡", group: "Money" },
  { id: "team", label: "Team Members", icon: "👨‍💼", group: "Operations" },
  { id: "tasks", label: "Tasks", icon: "📋", group: "Operations" },
  { id: "communication", label: "Communication", icon: "💬", group: "Operations" },
  { id: "finance", label: "Revenue & Finance", icon: "💰", group: "Money" },
  { id: "invoices", label: "All Invoices", icon: "📄", group: "Money" },
  { id: "analytics", label: "Analytics", icon: "📈", group: "Insights" },
  { id: "support", label: "Support Tickets", icon: "🎫", group: "Insights" },
  { id: "audit", label: "Audit Logs", icon: "📝", group: "Security" },
  { id: "system", label: "System Center", icon: "🛡️", group: "Security" },
  { id: "qa", label: "Production QA", icon: "✅", group: "Security" },
  { id: "settings", label: "Admin Settings", icon: "⚙️", group: "Security" },
];

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}


const roleLabels: Record<AdminTeamMember["role"], string> = {
  full_access: "Full Access",
  standard: "Standard",
  limited: "Limited",
  support: "Support",
  finance: "Finance",
  viewer: "Viewer",
};

const roleAccess: Record<AdminTeamMember["role"], string[]> = {
  full_access: ["Dashboard", "Users", "Invoice Balance", "Team", "Tasks", "Finance", "Invoices", "Analytics", "Support", "Audit", "Settings"],
  standard: ["Dashboard", "Tasks (own department)", "Support (if assigned)", "Communication"],
  limited: ["Dashboard", "Users", "Tasks"],
  support: ["Users", "Support", "Tasks"],
  finance: ["Finance", "Invoices", "Analytics"],
  viewer: ["Dashboard", "Users", "Invoices", "Analytics"],
};

function generatePassword() {
  const part = Math.random().toString(36).slice(2, 8);
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `RVX-${part}-${digits}`;
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

function adminTaskStatusLabel(status: string) {
  if (status === "pending") return "Assigned";
  if (status === "in_progress") return "In Progress";
  if (status === "blocked") return "Need Help";
  if (status === "done") return "Completed";
  return status.replace("_", " ");
}

function appendAdminTaskNote(existing: string | null | undefined, author: string, text: string) {
  const clean = text.trim();
  if (!clean) return existing ?? "";
  const stamp = new Date().toLocaleString();
  return `${existing ? `${existing}\n\n` : ""}[${stamp}] ${author}: ${clean}`;
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
  const [teamForm, setTeamForm] = useState({ name: "", email: "", password: "", role: "limited", department: "", notes: "" });
  const [departments, setDepartments] = useState<{ slug: string; name: string; icon: string }[]>([]);
  const [teamSearch, setTeamSearch] = useState("");
  const [teamStatusFilter, setTeamStatusFilter] = useState<"all" | "active" | "disabled">("all");
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [taskForm, setTaskForm] = useState({ title: "", description: "", assigned_to: "", department: "general", priority: "medium", due_date: "" });
  const [selectedAdminTaskId, setSelectedAdminTaskId] = useState<string | null>(null);
  const [adminTaskNote, setAdminTaskNote] = useState("");
  const [financeForm, setFinanceForm] = useState(emptyFormFinance());
  const [financeSearch, setFinanceSearch] = useState("");
  const [financeStatusFilter, setFinanceStatusFilter] = useState<"all" | AdminFinanceEntry["status"]>("all");
  const [financeSourceFilter, setFinanceSourceFilter] = useState<"all" | AdminFinanceEntry["source"]>("all");
  const [financeRange, setFinanceRange] = useState<"7" | "30" | "90" | "all">("30");
  const [supportForm, setSupportForm] = useState({ user_id: "", subject: "", message: "", priority: "medium", assigned_to: "", internal_notes: "" });
  const [supportSearch, setSupportSearch] = useState("");
  const [supportStatusFilter, setSupportStatusFilter] = useState<"all" | AdminSupportTicket["status"]>("all");
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [supportMessages, setSupportMessages] = useState<AdminSupportMessage[]>([]);
  const [supportAttachments, setSupportAttachments] = useState<AdminSupportAttachment[]>([]);
  const [supportReply, setSupportReply] = useState("");
  const [supportInternal, setSupportInternal] = useState(false);
  const [auditSearch, setAuditSearch] = useState("");
  const [systemSettings, setSystemSettings] = useState<AdminSystemSettings>(DEFAULT_SYSTEM_SETTINGS);
  const [savingSystem, setSavingSystem] = useState(false);
  const [balanceModal, setBalanceModal] = useState<InvoiceBalanceModalState>(null);
  const [freeProModal, setFreeProModal] = useState<FreeProModalState>(null);
  const [adminActionBusy, setAdminActionBusy] = useState(false);
  const [assignToast, setAssignToast] = useState<string | null>(null);
  const [taskSuggestion, setTaskSuggestion] = useState<{ id: string; name: string; open_count: number } | null>(null);

  function showAssignToast(text: string) {
    setAssignToast(text);
    window.setTimeout(() => setAssignToast((current) => (current === text ? null : current)), 2000);
  }

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

      const staffRows = (teamRes.data as AdminTeamMember[]) ?? [];
      const staffEmails = new Set(staffRows.map((m) => m.email?.toLowerCase()).filter(Boolean));
      const staffAuthIds = new Set(staffRows.map((m) => m.auth_user_id).filter(Boolean));
      const customerProfiles = ((profRes.data as Profile[]) ?? []).filter((profile) => {
        const email = profile.email?.toLowerCase() ?? "";
        const authId = profile.user_id || profile.id;
        return email !== ADMIN_EMAIL.toLowerCase() && !staffEmails.has(email) && !staffAuthIds.has(authId);
      });

      setProfiles(customerProfiles);
      setInvoices((invRes.data as Invoice[]) ?? []);
      setClients((clientsRes.data as Client[]) ?? []);
      setTeam(staffRows);
      setTasks((taskRes.data as AdminTask[]) ?? []);
      setFinance((financeRes.data as AdminFinanceEntry[]) ?? []);
      setAuditLogs((auditRes.data as AdminAuditLog[]) ?? []);
      setSupportTickets((supportRes.data as AdminSupportTicket[]) ?? []);

      const systemRes = await supabase
        .from("admin_system_settings")
        .select("value")
        .eq("key", "platform")
        .maybeSingle();
      if (!systemRes.error && systemRes.data?.value) {
        setSystemSettings({ ...DEFAULT_SYSTEM_SETTINGS, ...(systemRes.data.value as Partial<AdminSystemSettings>) });
      }
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
  const currentMonthStart = useMemo(() => {
    const date = new Date();
    date.setDate(1);
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);
  const selectedUserInvoicesThisMonth = selectedUserInvoices.filter((inv) => new Date(inv.created_at) >= currentMonthStart).length;
  const selectedUserInvoiceBalance = Number((selectedUser as unknown as { credits?: number } | null)?.credits ?? 0);
  const selectedUserFreeRemaining = Math.max(0, FREE_PLAN_LIMIT - selectedUserInvoicesThisMonth);
  const selectedUserIsUnlimited = Boolean(selectedUser?.is_pro || selectedUser?.plan === "pro" || selectedUser?.plan === "business");
  const selectedUserRemainingInvoices = selectedUserIsUnlimited
    ? "Unlimited"
    : String(selectedUserFreeRemaining + selectedUserInvoiceBalance);
  const selectedStatusInvoices = selectedInvoiceStatus === "all" ? selectedUserInvoices : selectedUserInvoices.filter((inv) => inv.status === selectedInvoiceStatus);
  const selectedUserBalanceHistory = selectedUser
    ? auditLogs
        .filter((log) =>
          log.target_id === selectedUser.id &&
          ["invoice_balance_added", "invoice_balance_reset", "add_invoice_balance", "reset_invoice_balance", "free_pro_granted", "remove_free_pro"].includes(log.action)
        )
        .slice(0, 8)
    : [];

  useEffect(() => {
    void supabase.from("departments").select("slug,name,icon").eq("is_active", true).order("name").then(({ data }) => setDepartments(data ?? []));
  }, []);

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

  const qaChecks = useMemo(() => {
    const checks = [
      { area: "Auth", check: "Owner admin session", status: isAdmin ? "pass" : "review", detail: `Logged admin must match ${ADMIN_EMAIL}` },
      { area: "Users", check: "Profiles loaded", status: profiles.length > 0 ? "pass" : "review", detail: `${profiles.length} profile records loaded` },
      { area: "Users", check: "Ban/Credits columns", status: profiles.every((p) => "is_banned" in (p as unknown as Record<string, unknown>) && "credits" in (p as unknown as Record<string, unknown>)) ? "pass" : "review", detail: "profiles.is_banned and profiles.credits must exist" },
      { area: "Invoices", check: "Invoice access", status: invoices.length >= 0 ? "pass" : "review", detail: `${invoices.length} invoices visible to admin policy` },
      { area: "Team", check: "Team table access", status: Array.isArray(team) ? "pass" : "review", detail: `${team.length} team records loaded` },
      { area: "Finance", check: "Finance ledger access", status: Array.isArray(finance) ? "pass" : "review", detail: `${finance.length} finance entries loaded` },
      { area: "Support", check: "Support tickets access", status: Array.isArray(supportTickets) ? "pass" : "review", detail: `${supportTickets.length} support tickets loaded` },
      { area: "Audit", check: "Audit log access", status: Array.isArray(auditLogs) ? "pass" : "review", detail: `${auditLogs.length} recent audit logs loaded` },
      { area: "System", check: "System settings", status: systemSettings ? "pass" : "review", detail: systemSettings.maintenance_mode ? "Maintenance mode is ON" : "Maintenance mode is OFF" },
    ] as const;
    const passed = checks.filter((item) => item.status === "pass").length;
    return { checks, passed, total: checks.length, score: Math.round((passed / checks.length) * 100) };
  }, [auditLogs, finance, invoices, isAdmin, profiles, supportTickets, systemSettings, team]);

  const financeReport = useMemo(() => {
    const today = new Date();
    const todayKey = today.toISOString().slice(0, 10);
    const monthKey = today.toISOString().slice(0, 7);
    const cutoff = financeRange === "all" ? null : new Date(Date.now() - Number(financeRange) * 24 * 60 * 60 * 1000);
    const q = financeSearch.trim().toLowerCase();

    const visible = finance.filter((entry) => {
      const entryDate = new Date(entry.entry_date);
      const matchesRange = !cutoff || entryDate >= cutoff;
      const matchesStatus = financeStatusFilter === "all" || entry.status === financeStatusFilter;
      const matchesSource = financeSourceFilter === "all" || entry.source === financeSourceFilter;
      const matchesSearch = !q || [entry.title, entry.source, entry.type, entry.status, entry.currency, entry.notes]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
      return matchesRange && matchesStatus && matchesSource && matchesSearch;
    });

    const income = visible
      .filter((entry) => entry.type === "income" && entry.status === "received")
      .reduce((sum, entry) => sum + Number(entry.amount), 0);
    const expenses = visible
      .filter((entry) => entry.type === "expense")
      .reduce((sum, entry) => sum + Number(entry.amount), 0);
    const pending = visible
      .filter((entry) => entry.type === "receivable" || entry.status === "pending")
      .reduce((sum, entry) => sum + Number(entry.amount), 0);
    const todayRevenue = finance
      .filter((entry) => entry.entry_date === todayKey && entry.type === "income" && entry.status === "received")
      .reduce((sum, entry) => sum + Number(entry.amount), 0);
    const monthlyRevenue = finance
      .filter((entry) => entry.entry_date?.startsWith(monthKey) && entry.type === "income" && entry.status === "received")
      .reduce((sum, entry) => sum + Number(entry.amount), 0);
    const subscriptionRevenue = visible
      .filter((entry) => entry.source === "subscription" && entry.status === "received")
      .reduce((sum, entry) => sum + Number(entry.amount), 0);
    const adsRevenue = visible
      .filter((entry) => entry.source === "ads" && entry.status === "received")
      .reduce((sum, entry) => sum + Number(entry.amount), 0);

    const trend = Array.from({ length: 7 }).map((_, index) => {
      const date = new Date(Date.now() - (6 - index) * 24 * 60 * 60 * 1000);
      const key = date.toISOString().slice(0, 10);
      const dayIncome = finance
        .filter((entry) => entry.entry_date === key && entry.type === "income" && entry.status === "received")
        .reduce((sum, entry) => sum + Number(entry.amount), 0);
      const dayExpense = finance
        .filter((entry) => entry.entry_date === key && entry.type === "expense")
        .reduce((sum, entry) => sum + Number(entry.amount), 0);
      return { key, label: date.toLocaleDateString(undefined, { day: "2-digit", month: "short" }), income: dayIncome, expense: dayExpense };
    });

    return { visible, income, expenses, pending, todayRevenue, monthlyRevenue, subscriptionRevenue, adsRevenue, net: income - expenses, trend };
  }, [finance, financeRange, financeSearch, financeSourceFilter, financeStatusFilter]);


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

  async function invokeAdminUserAction(action: string, body: Record<string, unknown>) {
    const { data, error: fnError } = await supabase.functions.invoke("admin-user-actions", {
      body: { action, ...body },
    });

    if (fnError) {
      throw new Error(fnError.message || "Admin user action failed");
    }

    return data as { ok?: boolean; message?: string };
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

  async function handleRemoveFreePro(profile: Profile, plan: "pro" | "business") {
    const planLabel = plan === "business" ? "Business" : "Pro";
    if (!window.confirm(`Is user ka free ${planLabel} access remove karna hai?`)) return;
    await updateProfile(profile.id, { is_pro: false, plan: "free", free_pro_until: null }, "remove_free_pro");
    await supabase.from("notifications").insert({
      audience: "user",
      recipient_user_id: (profile as unknown as { user_id?: string }).user_id || profile.id,
      type: "plan_removed",
      title: `Your free ${planLabel} access has ended`,
      body: `Your account is now on the Free plan.`,
      metadata: { previous_plan: plan },
    });
  }

  function exportCsv(rows: Record<string, unknown>[], filename: string) {
    if (rows.length === 0) {
      setNotice("No rows to export.");
      return;
    }
    const headers = Object.keys(rows[0]);
    const csvRows = rows.map((row) => headers.map((header) => `"${String(row[header] ?? "").replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([[headers.join(","), ...csvRows].join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function exportUsersCsv() {
    const headers = ["Business", "Email", "Country", "Phone", "GSTIN", "Plan", "Invoice Balance", "Banned", "Invoices", "Joined"];
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
    link.download = `rivox-users-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function handleBan(profile: Profile) {
    const reason = window.prompt("Ban reason?", "Violation of platform rules");
    if (reason === null) return;
    await updateProfile(profile.id, { is_banned: true, ban_reason: reason, banned_at: new Date().toISOString() }, "ban_user");

    try {
      await invokeAdminUserAction("mark_auth_banned", {
        user_id: profile.user_id || profile.id,
        reason,
      });
    } catch (err) {
      setNotice("Profile banned. Edge Function deploy nahi hai, isliye Auth metadata update skip hua.");
    }
  }

  async function handleUnban(profile: Profile) {
    await updateProfile(profile.id, { is_banned: false, ban_reason: null, banned_at: null }, "unban_user");

    try {
      await invokeAdminUserAction("mark_auth_unbanned", {
        user_id: profile.user_id || profile.id,
      });
    } catch (err) {
      setNotice("Profile unbanned. Edge Function deploy nahi hai, isliye Auth metadata update skip hua.");
    }
  }

  async function handleResetUserPassword(profile: Profile) {
    const password = window.prompt("New temporary login password (minimum 8 chars)", generatePassword());
    if (!password || password.length < 8) {
      setError("Password minimum 8 characters hona chahiye.");
      return;
    }

    try {
      await invokeAdminUserAction("reset_password", {
        user_id: profile.user_id || profile.id,
        password,
      });
      await logAction("reset_user_password", "profile", profile.id, { email: profile.email });
      setNotice("User password reset. Share the temporary password securely.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Password reset failed. Edge Function deploy check karo.");
    }
  }

  function openInvoiceBalanceModal(profile: Profile) {
    setError(null);
    setNotice(null);
    setBalanceModal({ profile, amount: "", reason: "Manual admin adjustment" });
  }

  async function submitInvoiceBalance(amountOverride?: number) {
    if (!balanceModal) return;
    const rawAmount = amountOverride ?? Number(balanceModal.amount);
    const amount = Math.floor(rawAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid positive invoice count.");
      return;
    }

    const profile = balanceModal.profile;
    const current = Number((profile as unknown as { credits?: number }).credits ?? 0);
    const next = current + amount;
    setAdminActionBusy(true);
    setError(null);
    setNotice(null);
    try {
      await updateProfile(
        profile.id,
        { credits: next },
        "add_invoice_balance"
      );
      await logAction("invoice_balance_added", "profile", profile.id, {
        email: profile.email,
        added: amount,
        previous_balance: current,
        new_balance: next,
        reason: balanceModal.reason || "Manual admin adjustment",
      });
      setBalanceModal(null);
      setNotice(`${amount} invoice${amount === 1 ? "" : "s"} added. New invoice balance: ${next}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invoice balance update failed.");
    } finally {
      setAdminActionBusy(false);
    }
  }

  async function handleResetCredits(profile: Profile) {
    const current = Number((profile as unknown as { credits?: number }).credits ?? 0);
    const reason = window.prompt(`Invoice balance reset karna hai? Current balance: ${current}. Reason likho:`, "Manual reset");
    if (reason === null) return;
    await updateProfile(profile.id, { credits: 0 }, "reset_invoice_balance");
    await logAction("invoice_balance_reset", "profile", profile.id, { email: profile.email, previous_balance: current, reason });
  }

  function openFreeProModal(profile: Profile, plan: "pro" | "business" = "pro") {
    setError(null);
    setNotice(null);
    setFreeProModal({ profile, days: "30", reason: `Manual free ${plan === "business" ? "Business" : "Pro"} access`, plan });
  }

  async function submitFreePro(daysOverride?: number) {
    if (!freeProModal) return;
    const days = daysOverride ?? Number(freeProModal.days);
    if (!Number.isFinite(days) || days <= 0) {
      setError("Enter a valid Free Pro duration in days.");
      return;
    }

    const profile = freeProModal.profile;
    const plan = freeProModal.plan;
    const planLabel = plan === "business" ? "Business" : "Pro";
    const until = new Date();
    until.setDate(until.getDate() + days);
    setAdminActionBusy(true);
    setError(null);
    setNotice(null);
    try {
      await updateProfile(profile.id, { is_pro: true, plan, free_pro_until: until.toISOString() }, `give_free_${plan}`);
      await logAction(`free_${plan}_granted`, "profile", profile.id, {
        email: profile.email,
        days,
        free_pro_until: until.toISOString(),
        reason: freeProModal.reason || `Manual free ${planLabel} access`,
      });
      await supabase.from("notifications").insert({
        audience: "user",
        recipient_user_id: (profile as unknown as { user_id?: string }).user_id || profile.id,
        type: "plan_granted",
        title: `You've been given free ${planLabel} access`,
        body: `Reason: ${freeProModal.reason || `Manual free ${planLabel} access`}. Valid for ${days} day${days === 1 ? "" : "s"}, until ${until.toLocaleDateString()}.`,
        metadata: { plan, days, free_pro_until: until.toISOString(), reason: freeProModal.reason || null },
      });
      setFreeProModal(null);
      setNotice(`Free ${planLabel} is active for ${days} day${days === 1 ? "" : "s"}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Free ${planLabel} update failed.`);
    } finally {
      setAdminActionBusy(false);
    }
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

    // Remove the Auth identity first. If this fails, keep all customer data
    // intact so the account cannot be left as a registered email with an
    // empty/recreated profile.
    try {
      await invokeAdminUserAction("delete_auth_user", { user_id: authId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auth user could not be deleted. No customer data was removed.");
      return;
    }

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
    setNotice("User data + Auth user deleted.");
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
          department: teamForm.department || null,
          temporary_password: teamForm.password,
          notes: teamForm.notes || "Edge Function not deployed yet. Deploy create-team-member for real Auth login.",
          created_by: user?.id ?? null,
        });
        if (insertError) throw insertError;
        setNotice("Team record created. Edge Function deploy karne ke baad real login create hoga.");
      } else {
        if (data?.email_sent) {
          setNotice(`Team member created. Welcome email sent to ${teamForm.email}.`);
        } else if (data?.email_error) {
          setNotice(`Team member created, but email failed: ${data.email_error}`);
        } else {
          setNotice(data?.message ?? "Team member created. Email not configured yet.");
        }
      }

      await logAction("create_team_member", "admin_team_members", teamForm.email, { role: teamForm.role });
      setTeamForm({ name: "", email: "", password: "", role: "limited", department: "", notes: "" });
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
      department: taskForm.department,
      status: "pending",
      progress: 0,
      due_date: taskForm.due_date || null,
      created_by: user?.id ?? null,
    });
    if (insertError) return setError(insertError.message);
    await logAction("create_task", "admin_tasks", taskForm.title);
    const assignee = team.find((m) => m.id === taskForm.assigned_to);
    setTaskForm({ title: "", description: "", assigned_to: "", department: "general", priority: "medium", due_date: "" });
    setNotice("Task created.");
    showAssignToast(assignee ? `Assigned to ${assignee.name || assignee.email} ✓` : "Task created ✓");
    await load();
  }

  async function updateTaskStatus(task: AdminTask, status: AdminTask["status"]) {
    const progress = status === "done" ? 100 : status === "in_progress" ? Math.max(task.progress ?? 25, 25) : status === "blocked" ? task.progress ?? 0 : 0;
    const { error: updateError } = await supabase.from("admin_tasks").update({ status, progress }).eq("id", task.id);
    if (updateError) return setError(updateError.message);
    await logAction("update_task_status", "admin_tasks", task.id, { status, progress });
    await load();
  }

  async function updateTaskProgress(task: AdminTask, progress: number) {
    const cleanProgress = Math.max(0, Math.min(100, progress));
    const nextStatus: AdminTask["status"] = cleanProgress >= 100 ? "done" : cleanProgress > 0 ? "in_progress" : task.status;
    const { error: updateError } = await supabase.from("admin_tasks").update({ progress: cleanProgress, status: nextStatus }).eq("id", task.id);
    if (updateError) return setError(updateError.message);
    await logAction("update_task_progress", "admin_tasks", task.id, { progress: cleanProgress });
    await load();
  }

  async function addAdminTaskNote(task: AdminTask) {
    const nextNotes = appendAdminTaskNote(task.internal_notes, user?.email || "Admin", adminTaskNote);
    setAdminTaskNote("");
    const { error: updateError } = await supabase.from("admin_tasks").update({ internal_notes: nextNotes }).eq("id", task.id);
    if (updateError) return setError(updateError.message);
    await logAction("add_task_note", "admin_tasks", task.id, { note: adminTaskNote });
    setNotice("Admin note added.");
    await load();
  }

  async function approveTask(task: AdminTask) {
    const { error: updateError } = await supabase.from("admin_tasks").update({ status: "done", progress: 100 }).eq("id", task.id);
    if (updateError) return setError(updateError.message);
    await logAction("approve_task", "admin_tasks", task.id);
    setNotice("Task approved.");
    await load();
  }

  async function reopenTask(task: AdminTask) {
    const { error: updateError } = await supabase.from("admin_tasks").update({ status: "pending", progress: Math.min(task.progress ?? 0, 25) }).eq("id", task.id);
    if (updateError) return setError(updateError.message);
    await logAction("reopen_task", "admin_tasks", task.id);
    setNotice("Task reopened.");
    await load();
  }

  async function deleteTask(task: AdminTask) {
    if (!window.confirm(`Delete task: ${task.title}?`)) return;
    const { error: deleteError } = await supabase.from("admin_tasks").delete().eq("id", task.id);
    if (deleteError) return setError(deleteError.message);
    await logAction("delete_task", "admin_tasks", task.id, { title: task.title });
    setNotice("Task deleted.");
    await load();
  }

  async function handleCreateSupportTicket(e: React.FormEvent) {
    e.preventDefault();
    const { error: insertError } = await supabase.from("admin_support_tickets").insert({
      user_id: supportForm.user_id || null,
      subject: supportForm.subject,
      message: supportForm.message || null,
      priority: supportForm.priority,
      assigned_to: supportForm.assigned_to || null,
      internal_notes: supportForm.internal_notes || null,
      status: "open",
    });
    if (insertError) return setError(insertError.message);
    await logAction("create_support_ticket", "admin_support_tickets", supportForm.subject, { priority: supportForm.priority });
    setSupportForm({ user_id: "", subject: "", message: "", priority: "medium", assigned_to: "", internal_notes: "" });
    setNotice("Support ticket created.");
    await load();
  }

  async function updateTicketStatus(ticket: AdminSupportTicket, status: AdminSupportTicket["status"]) {
    const { error: updateError } = await supabase.from("admin_support_tickets").update({ status, closed_at: status === "closed" ? new Date().toISOString() : null }).eq("id", ticket.id);
    if (updateError) return setError(updateError.message);
    await logAction("update_ticket_status", "admin_support_tickets", ticket.id, { status });
    await load();
  }

  async function updateTicketAssignment(ticket: AdminSupportTicket, assigned_to: string) {
    const { error: updateError } = await supabase.from("admin_support_tickets").update({ assigned_to: assigned_to || null }).eq("id", ticket.id);
    if (updateError) return setError(updateError.message);
    await logAction("assign_ticket", "admin_support_tickets", ticket.id, { assigned_to: assigned_to || null });
    const assignee = team.find((m) => m.id === assigned_to);
    showAssignToast(assignee ? `Assigned to ${assignee.name || assignee.email} ✓` : "Ticket unassigned");
    await load();
  }

  async function loadSupportMessages(ticketId: string) {
    const { data, error: messageError } = await supabase.from("support_ticket_messages").select("*").eq("ticket_id", ticketId).order("created_at", { ascending: true });
    if (messageError) return setError(messageError.message);
    setSupportMessages((data ?? []) as AdminSupportMessage[]);
  }

  async function loadSupportAttachments(ticketId: string) {
    const { data } = await supabase.from("support_ticket_attachments").select("id,ticket_id,file_name,storage_path").eq("ticket_id", ticketId).order("created_at");
    const signed = await Promise.all(((data ?? []) as AdminSupportAttachment[]).map(async (item) => {
      const { data: url } = await supabase.storage.from("support-attachments").createSignedUrl(item.storage_path, 3600);
      return { ...item, signed_url: url?.signedUrl };
    }));
    setSupportAttachments(signed);
  }

  async function sendAdminSupportReply(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTicket || !user || !supportReply.trim()) return;
    const now = new Date().toISOString();
    const { error: insertError } = await supabase.from("support_ticket_messages").insert({
      ticket_id: selectedTicket.id, author_user_id: user.id, author_type: "admin", message: supportReply.trim(), is_internal: supportInternal,
    });
    if (insertError) return setError(insertError.message);
    const nextStatus = supportInternal ? selectedTicket.status : "pending";
    await supabase.from("admin_support_tickets").update({ status: nextStatus, updated_at: now, last_reply_at: now, ...(!supportInternal ? { first_admin_reply_at: now } : {}) }).eq("id", selectedTicket.id);
    await logAction("reply_support_ticket", "admin_support_tickets", selectedTicket.id, { internal: supportInternal });
    setSupportReply(""); setSupportInternal(false); setNotice(supportInternal ? "Internal note added." : "Reply sent to customer.");
    await Promise.all([loadSupportMessages(selectedTicket.id), load()]);
  }

  async function updateTicketPriority(ticket: AdminSupportTicket, priority: AdminSupportTicket["priority"]) {
    const { error: updateError } = await supabase.from("admin_support_tickets").update({ priority }).eq("id", ticket.id);
    if (updateError) return setError(updateError.message);
    await logAction("update_ticket_priority", "admin_support_tickets", ticket.id, { priority });
    await load();
  }

  async function deleteTicket(ticket: AdminSupportTicket) {
    if (!window.confirm(`Delete ticket: ${ticket.subject}?`)) return;
    const { error: deleteError } = await supabase.from("admin_support_tickets").delete().eq("id", ticket.id);
    if (deleteError) return setError(deleteError.message);
    await logAction("delete_ticket", "admin_support_tickets", ticket.id, { subject: ticket.subject });
    setSelectedTicketId(null);
    setNotice("Support ticket deleted.");
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

  async function markFinanceReceived(entry: AdminFinanceEntry) {
    const { error: updateError } = await supabase
      .from("admin_finance_entries")
      .update({ status: "received", type: entry.type === "receivable" ? "income" : entry.type })
      .eq("id", entry.id);
    if (updateError) return setError(updateError.message);
    await logAction("mark_finance_received", "admin_finance_entries", entry.id, { title: entry.title, amount: entry.amount });
    setNotice("Finance entry marked received.");
    await load();
  }

  async function deleteFinanceEntry(entry: AdminFinanceEntry) {
    const ok = window.confirm(`Delete finance entry: ${entry.title}?`);
    if (!ok) return;
    const { error: deleteError } = await supabase.from("admin_finance_entries").delete().eq("id", entry.id);
    if (deleteError) return setError(deleteError.message);
    await logAction("delete_finance_entry", "admin_finance_entries", entry.id, { title: entry.title, amount: entry.amount });
    setNotice("Finance entry deleted.");
    await load();
  }

  async function saveSystemSettings() {
    setSavingSystem(true);
    setError(null);
    setNotice(null);
    const payload = { key: "platform", value: systemSettings, updated_by: user?.id ?? null, updated_at: new Date().toISOString() };
    const { error: saveError } = await supabase.from("admin_system_settings").upsert(payload, { onConflict: "key" });
    setSavingSystem(false);
    if (saveError) {
      setError(saveError.message + " — Supabase SQL migration 20260708120000_admin_system_center.sql run karo.");
      return;
    }
    await logAction("update_system_settings", "admin_system_settings", "platform", systemSettings as unknown as Record<string, unknown>);
    setNotice("System settings saved.");
  }

  function updateSystemSetting<K extends keyof AdminSystemSettings>(key: K, value: AdminSystemSettings[K]) {
    setSystemSettings((current) => ({ ...current, [key]: value }));
  }

  const groupedSections = sections.reduce<Record<string, typeof sections>>((acc, item) => {
    acc[item.group] = acc[item.group] ?? [];
    acc[item.group].push(item);
    return acc;
  }, {});

  const supportAgents = team.filter((m) => m.status === "active" && ["full_access", "support", "limited", "finance"].includes(m.role));
  const filteredSupportTickets = useMemo(() => {
    const q = supportSearch.trim().toLowerCase();
    return supportTickets.filter((ticket) => {
      const matchesSearch = !q || [ticket.subject, ticket.message, ticket.priority, ticket.status].some((v) => (v || "").toLowerCase().includes(q));
      const matchesStatus = supportStatusFilter === "all" || ticket.status === supportStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [supportTickets, supportSearch, supportStatusFilter]);
  const selectedTicket = supportTickets.find((ticket) => ticket.id === selectedTicketId) ?? filteredSupportTickets[0] ?? null;

  useEffect(() => {
    if (selectedTicket?.id) void Promise.all([loadSupportMessages(selectedTicket.id), loadSupportAttachments(selectedTicket.id)]);
    else { setSupportMessages([]); setSupportAttachments([]); }
  }, [selectedTicket?.id]);

  useEffect(() => {
    if (taskForm.assigned_to) { setTaskSuggestion(null); return; }
    let cancelled = false;
    void supabase
      .rpc("admin_suggest_assignee", { p_kind: "task", p_department: taskForm.department })
      .then(({ data }) => {
        if (cancelled) return;
        const row = Array.isArray(data) ? data[0] : null;
        setTaskSuggestion(row ? { id: row.member_id, name: row.name || row.email, open_count: row.open_count } : null);
      });
    return () => { cancelled = true; };
  }, [taskForm.department, taskForm.assigned_to]);

  const selectedAdminTask = selectedAdminTaskId ? tasks.find((task) => task.id === selectedAdminTaskId) ?? null : null;
  const filteredAuditLogs = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    if (!q) return auditLogs;
    return auditLogs.filter((log) => [log.action, log.target_type, log.target_id, JSON.stringify(log.details ?? {})].some((v) => (v || "").toLowerCase().includes(q)));
  }, [auditLogs, auditSearch]);


  const analytics = useMemo(() => {
    const now = new Date();
    const currentMonthKey = now.toISOString().slice(0, 7);
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const paidInvoiceRevenue = invoices
      .filter((invoice) => invoice.status === "paid")
      .reduce((sum, invoice) => sum + Number(invoice.base_total ?? invoice.total ?? invoice.invoice_total ?? 0), 0);
    const financeRevenue = finance
      .filter((entry) => entry.type === "income" && entry.status === "received")
      .reduce((sum, entry) => sum + Number(entry.amount), 0);
    const totalRevenue = paidInvoiceRevenue + financeRevenue;
    const totalExpenses = finance
      .filter((entry) => entry.type === "expense")
      .reduce((sum, entry) => sum + Number(entry.amount), 0);

    const monthRevenue = finance
      .filter((entry) => entry.entry_date?.startsWith(currentMonthKey) && entry.type === "income" && entry.status === "received")
      .reduce((sum, entry) => sum + Number(entry.amount), 0);
    const previousMonthRevenue = finance
      .filter((entry) => entry.entry_date?.startsWith(previousMonth) && entry.type === "income" && entry.status === "received")
      .reduce((sum, entry) => sum + Number(entry.amount), 0);
    const revenueGrowth = previousMonthRevenue > 0 ? ((monthRevenue - previousMonthRevenue) / previousMonthRevenue) * 100 : monthRevenue > 0 ? 100 : 0;

    const newUsers7 = profiles.filter((profile) => new Date(profile.created_at) >= sevenDaysAgo).length;
    const newUsers30 = profiles.filter((profile) => new Date(profile.created_at) >= thirtyDaysAgo).length;
    const proUsers = profiles.filter((profile) => profile.is_pro || profile.plan === "pro" || profile.plan === "business").length;
    const conversionRate = profiles.length ? (proUsers / profiles.length) * 100 : 0;
    const activeUsers = profiles.filter((profile) => !(profile as unknown as { is_banned?: boolean }).is_banned).length;

    const invoiceGrowth = Array.from({ length: 14 }).map((_, index) => {
      const date = new Date(Date.now() - (13 - index) * 24 * 60 * 60 * 1000);
      const key = date.toISOString().slice(0, 10);
      const count = invoices.filter((invoice) => invoice.created_at?.slice(0, 10) === key).length;
      const revenue = invoices
        .filter((invoice) => invoice.created_at?.slice(0, 10) === key && invoice.status === "paid")
        .reduce((sum, invoice) => sum + Number(invoice.base_total ?? invoice.total ?? invoice.invoice_total ?? 0), 0);
      return { key, label: date.toLocaleDateString(undefined, { day: "2-digit", month: "short" }), count, revenue };
    });

    const userGrowth = Array.from({ length: 14 }).map((_, index) => {
      const date = new Date(Date.now() - (13 - index) * 24 * 60 * 60 * 1000);
      const key = date.toISOString().slice(0, 10);
      const count = profiles.filter((profile) => profile.created_at?.slice(0, 10) === key).length;
      return { key, label: date.toLocaleDateString(undefined, { day: "2-digit", month: "short" }), count };
    });

    const countryCounts = profiles.reduce<Record<string, number>>((acc, profile) => {
      const country = profile.country || "Unknown";
      acc[country] = (acc[country] ?? 0) + 1;
      return acc;
    }, {});
    const topCountries = Object.entries(countryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const customerRevenue = profiles.map((profile) => {
      const authId = profile.user_id || profile.id;
      const userInvoices = invoices.filter((invoice) => invoice.user_id === authId);
      const revenue = userInvoices
        .filter((invoice) => invoice.status === "paid")
        .reduce((sum, invoice) => sum + Number(invoice.base_total ?? invoice.total ?? invoice.invoice_total ?? 0), 0);
      return {
        id: profile.id,
        name: profile.business_name || profile.email || "Unnamed user",
        email: profile.email || "No email",
        revenue,
        invoices: userInvoices.length,
      };
    }).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

    const overdueAmount = invoices
      .filter((invoice) => invoice.status === "overdue")
      .reduce((sum, invoice) => sum + Number(invoice.base_total ?? invoice.total ?? invoice.invoice_total ?? 0), 0);
    const pendingFinance = finance
      .filter((entry) => entry.status === "pending" || entry.type === "receivable")
      .reduce((sum, entry) => sum + Number(entry.amount), 0);

    const insights = [
      {
        title: revenueGrowth >= 0 ? "Revenue growth positive" : "Revenue dropped",
        body: `This month revenue is ${Math.abs(revenueGrowth).toFixed(1)}% ${revenueGrowth >= 0 ? "up" : "down"} vs previous month.`,
        tone: revenueGrowth >= 0 ? "green" : "red",
      },
      {
        title: "Free to Pro conversion",
        body: `${conversionRate.toFixed(1)}% users are on Pro/Business plan.`,
        tone: conversionRate >= 10 ? "green" : "amber",
      },
      {
        title: "Collection watch",
        body: `${formatMoney(overdueAmount + pendingFinance, "INR")} is overdue or pending.`,
        tone: overdueAmount + pendingFinance > 0 ? "amber" : "green",
      },
      {
        title: "User acquisition",
        body: `${newUsers7} new users in last 7 days and ${newUsers30} in last 30 days.`,
        tone: newUsers7 > 0 ? "green" : "slate",
      },
    ];

    return {
      totalRevenue,
      totalExpenses,
      netProfit: totalRevenue - totalExpenses,
      monthRevenue,
      revenueGrowth,
      newUsers7,
      newUsers30,
      activeUsers,
      conversionRate,
      invoiceGrowth,
      userGrowth,
      topCountries,
      customerRevenue,
      overdueAmount,
      pendingFinance,
      insights,
    };
  }, [profiles, invoices, finance]);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-primary-600">Owner workspace</p>
          <p className="mt-1 text-lg font-black text-slate-950">Administration & operations</p>
          <p className="text-sm text-slate-500">Manage subscriptions, users, staff, support and internal communication.</p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> Production console
        </div>
      </div>
      <div className="grid lg:grid-cols-[260px_1fr] gap-6">
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
        {assignToast && (
          <div className="fixed top-6 right-6 z-50 rounded-xl bg-slate-900 text-white px-4 py-3 text-sm font-bold shadow-2xl animate-[fadeIn_.15s_ease-out]">
            {assignToast}
          </div>
        )}
        {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
        {notice && <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">{notice}</div>}
        {dataLoading ? <div className="card p-10 text-center text-sm text-slate-500">Loading admin data...</div> : null}

        {active === "dashboard" && (
          <section className="space-y-6">
            <AdminOperationsCommand onNavigate={(section) => setActive(section)} />
            <AdminUnifiedKPI onNavigate={(section) => setActive(section)} />
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

        {active === "subscriptions" && <AdminSubscriptionManager />}
        {active === "growth" && <><AdminCustomerSuccess /><AdminGrowthCenter /></>}
        {active === "paddle" && <AdminPaddleSettings />}
        {active === "subscriptionAutomation" && <AdminSubscriptionAutomation />}
        {active === "billingRecovery" && <AdminBillingRecovery profiles={profiles} team={team} />}

        {active === "communication" && (
          <CommunicationCenter actorName={user?.email || "Owner Admin"} actorRole="Owner Admin" canManageChannels />
        )}

        {active === "users" && (
          <section className="space-y-6">
            <SectionHeader title="User Management" subtitle="Search, filter, full user 360 detail, ban/unban, invoice balance, free Pro aur notes" />

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
                      <option value="credits_high">Invoice balance high to low</option>
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
                        <th className="text-left text-xs font-semibold text-slate-500 uppercase px-5 py-3 hidden md:table-cell">Invoice Balance</th>
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
                      <Info label="Added Invoice Balance" value={String(selectedUserInvoiceBalance)} />
                      <Info label="Used This Month" value={`${selectedUserInvoicesThisMonth} / ${FREE_PLAN_LIMIT} free`} />
                      <Info label="Remaining Invoices" value={selectedUserRemainingInvoices} />
                      <Info label="Joined" value={formatDate(selectedUser.created_at)} />
                      <Info label="Free Pro Until" value={String((selectedUser as unknown as { free_pro_until?: string | null }).free_pro_until ? formatDate(String((selectedUser as unknown as { free_pro_until?: string }).free_pro_until)) : "—")} />
                    </div>

                    {(selectedUser as unknown as { ban_reason?: string | null }).ban_reason && (
                      <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                        Ban reason: {(selectedUser as unknown as { ban_reason?: string | null }).ban_reason}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <button className="btn-secondary" onClick={() => openInvoiceBalanceModal(selectedUser)}>Add Invoices</button>
                      <button className="btn-secondary" onClick={() => handleResetCredits(selectedUser)}>Reset Balance</button>
                      <button className="btn-primary" onClick={() => openFreeProModal(selectedUser, "pro")}>Give Free Pro</button>
                      <button className="btn-primary" onClick={() => openFreeProModal(selectedUser, "business")}>Give Free Business</button>
                      <button className="btn-secondary" onClick={() => handleRemoveFreePro(selectedUser, "pro")}>Remove Pro</button>
                      <button className="btn-secondary" onClick={() => handleRemoveFreePro(selectedUser, "business")}>Remove Business</button>
                      <button className="btn-secondary col-span-2" onClick={() => handleResetUserPassword(selectedUser)}>Reset Login Password</button>
                      {(selectedUser as unknown as { is_banned?: boolean }).is_banned ? (
                        <button className="btn-primary col-span-2" onClick={() => handleUnban(selectedUser)}>Unban User</button>
                      ) : (
                        <button className="col-span-2 rounded-lg bg-red-600 text-white px-4 py-2 text-sm font-semibold hover:bg-red-700" onClick={() => handleBan(selectedUser)}>Ban User</button>
                      )}
                      <button className="col-span-2 rounded-lg bg-red-50 text-red-700 border border-red-200 px-4 py-2 text-sm font-semibold hover:bg-red-100" onClick={() => handleDeleteUserData(selectedUser)}>Delete User Data</button>
                    </div>

                    <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="font-semibold text-slate-900">Invoice Balance Summary</p>
                          <p className="text-xs text-slate-500">Free monthly invoices + admin-added invoice balance</p>
                        </div>
                        <Pill className={selectedUserIsUnlimited ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-blue-50 text-blue-700 border-blue-200"}>
                          {selectedUserIsUnlimited ? "Unlimited" : `${selectedUserRemainingInvoices} left`}
                        </Pill>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-lg bg-white border border-slate-100 p-3">
                          <p className="text-xs text-slate-500">Free left</p>
                          <p className="text-lg font-bold text-slate-900">{selectedUserIsUnlimited ? "∞" : selectedUserFreeRemaining}</p>
                        </div>
                        <div className="rounded-lg bg-white border border-slate-100 p-3">
                          <p className="text-xs text-slate-500">Extra balance</p>
                          <p className="text-lg font-bold text-slate-900">{selectedUserInvoiceBalance}</p>
                        </div>
                        <div className="rounded-lg bg-white border border-slate-100 p-3">
                          <p className="text-xs text-slate-500">Used this month</p>
                          <p className="text-lg font-bold text-slate-900">{selectedUserInvoicesThisMonth}</p>
                        </div>
                      </div>
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
                        {selectedUserBalanceHistory.map((log) => (
                          <TimelineItem key={log.id} label={log.action.replace(/_/g, " ")} date={log.created_at} />
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
            <SectionHeader title="Invoice Balance & Plans" subtitle="Manage invoice balance and Free Pro access from one place." />
            <Card>
              <div className="p-5 border-b border-slate-100"><h2 className="text-lg font-semibold text-slate-900">Quick Actions</h2></div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr className="border-b border-slate-100 bg-slate-50/50"><th className="text-left text-xs font-semibold text-slate-500 uppercase px-5 py-3">User</th><th className="text-left text-xs font-semibold text-slate-500 uppercase px-5 py-3">Plan</th><th className="text-left text-xs font-semibold text-slate-500 uppercase px-5 py-3">Invoice Balance</th><th className="text-right text-xs font-semibold text-slate-500 uppercase px-5 py-3">Actions</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {profiles.map((p) => <tr key={p.id}><td className="px-5 py-3.5"><p className="font-medium text-slate-900">{p.business_name || "Unnamed"}</p><p className="text-xs text-slate-500">{p.email}</p></td><td className="px-5 py-3.5"><Pill className={p.is_pro ? "bg-amber-50 text-amber-700 border-amber-200" : statusClass("closed")}>{p.is_pro ? ((p as unknown as { plan?: string }).plan === "business" ? "Business" : "Pro") : "Free"}</Pill></td><td className="px-5 py-3.5 font-semibold">{Number((p as unknown as { credits?: number }).credits ?? 0)}</td><td className="px-5 py-3.5 text-right space-x-2"><button className="btn-secondary text-xs py-1.5 px-3" onClick={() => openInvoiceBalanceModal(p)}>Add Invoices</button><button className="btn-primary text-xs py-1.5 px-3" onClick={() => openFreeProModal(p, "pro")}>Give Free Pro</button><button className="btn-primary text-xs py-1.5 px-3" onClick={() => openFreeProModal(p, "business")}>Give Free Business</button></td></tr>)}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>
        )}

        {active === "team" && (
          <section className="space-y-6">
            <AdminTeamWorkload />
            <SectionHeader title="Manage Team Members" subtitle="Create staff accounts, assign permissions, and manage workload from one place." />
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
                    <p className="text-sm text-slate-500">Creates a staff record and secure Supabase login with a temporary password.</p>
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
                    <option value="standard">Standard (department staff)</option>
                    <option value="full_access">Full Access</option>
                    <option value="support">Support (legacy)</option>
                    <option value="finance">Finance (legacy)</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <select className="input" value={teamForm.department} onChange={(e) => setTeamForm({ ...teamForm, department: e.target.value })}>
                    <option value="">No department (cross-team / Full Access)</option>
                    {departments.map((d) => <option key={d.slug} value={d.slug}>{d.icon} {d.name}</option>)}
                  </select>
                  <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Role Access Preview</p>
                    <div className="flex flex-wrap gap-2">
                      {roleAccess[teamForm.role as AdminTeamMember["role"]].map((item) => <Pill key={item} className="bg-white text-slate-700 border-slate-200">{item}</Pill>)}
                    </div>
                  </div>
                  <textarea className="input min-h-24" placeholder="Notes / responsibility" value={teamForm.notes} onChange={(e) => setTeamForm({ ...teamForm, notes: e.target.value })} />
                  <button className="btn-primary w-full" type="submit">Create Team Member + Send Email</button>
                </form>
                <div className="text-xs text-slate-500 mt-3 space-y-1">
                  <p>Staff portal URL: <b>https://staff.rivox.com</b></p>
                  <p>Set the Supabase secret <b>RESEND_API_KEY</b> to email the staff portal URL, work email, and temporary password automatically.</p>
                </div>
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
                        <Info label="Invite Email" value={selectedTeam.invite_status ? `${selectedTeam.invite_status}${selectedTeam.invite_email_sent_at ? ` • ${formatDate(selectedTeam.invite_email_sent_at)}` : ""}` : "—"} />
                        <Info label="Staff Portal" value={selectedTeam.staff_portal_url || "https://staff.rivox.com"} />
                      </div>
                      <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
                        <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Allowed Modules</p>
                        <div className="flex flex-wrap gap-2">
                          {roleAccess[selectedTeam.role].map((item) => <Pill key={item} className="bg-white text-slate-700 border-slate-200">{item}</Pill>)}
                        </div>
                      </div>
                      {selectedTeam.invite_error && <div className="rounded-xl bg-red-50 border border-red-100 p-4"><p className="text-xs text-red-500 mb-1">Invite Email Error</p><p className="text-sm text-red-700 whitespace-pre-wrap">{selectedTeam.invite_error}</p></div>}
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
            <SectionHeader title="Tasks" subtitle="Assign, track, review and approve staff work" />
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <Metric title="Pending" value={String(tasks.filter((t) => t.status === "pending").length)} icon="⏳" />
              <Metric title="In Progress" value={String(tasks.filter((t) => t.status === "in_progress").length)} icon="🚧" />
              <Metric title="Blocked" value={String(tasks.filter((t) => t.status === "blocked").length)} icon="🛑" />
              <Metric title="Done" value={String(tasks.filter((t) => t.status === "done").length)} icon="✅" />
            </div>
            <div className="grid xl:grid-cols-[420px_1fr] gap-6">
              <Card className="p-5 h-fit">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Assign New Task</h2>
                <form onSubmit={handleAddTask} className="space-y-3">
                  <input className="input" required placeholder="Task title" value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} />
                  <textarea className="input min-h-24" placeholder="Description" value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} />
                  <select className="input" value={taskForm.assigned_to} onChange={(e) => setTaskForm({ ...taskForm, assigned_to: e.target.value })}>
                    <option value="">Unassigned</option>{team.map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
                  </select>
                  {taskSuggestion && !taskForm.assigned_to && (
                    <button
                      type="button"
                      onClick={() => setTaskForm({ ...taskForm, assigned_to: taskSuggestion.id })}
                      className="w-full flex items-center justify-between rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-700 hover:bg-primary-100"
                    >
                      <span>💡 Suggested: {taskSuggestion.name} ({taskSuggestion.open_count} open)</span>
                      <span className="underline">Use</span>
                    </button>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <select className="input" value={taskForm.department} onChange={(e) => setTaskForm({ ...taskForm, department: e.target.value, assigned_to: "" })}>
                      <option value="general">📋 General</option><option value="support">🎧 Support</option><option value="finance">💰 Finance</option><option value="sales">📢 Sales</option><option value="engineering">⚙️ Engineering</option><option value="marketing">📣 Marketing</option><option value="hr">👤 HR</option><option value="legal">⚖️ Legal</option>
                    </select>
                    <div className="flex items-center gap-1">
                      {([["low", "⚪", "Low", "bg-slate-100 text-slate-600 border-slate-200"], ["medium", "🟡", "Med", "bg-amber-50 text-amber-700 border-amber-200"], ["high", "🟠", "High", "bg-orange-50 text-orange-700 border-orange-200"], ["urgent", "🔴", "Urgent", "bg-red-50 text-red-700 border-red-200"]] as const).map(([value, dot, label, cls]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setTaskForm({ ...taskForm, priority: value })}
                          className={`flex-1 rounded-lg border px-1.5 py-2 text-[11px] font-bold ${taskForm.priority === value ? cls + " ring-2 ring-offset-1 ring-primary-400" : "bg-white text-slate-400 border-slate-200"}`}
                        >
                          {dot} {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input className="input" type="date" value={taskForm.due_date} onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })} />
                  <button className="btn-primary w-full" type="submit">Create Task</button>
                </form>
              </Card>
              <Card>
                <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slate-900">Task Board</h2>
                  <button className="btn-secondary" onClick={() => exportCsv(tasks as unknown as Record<string, unknown>[], "admin-tasks.csv")}>Export CSV</button>
                </div>
                <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4 p-4">
                  {(["pending", "in_progress", "blocked", "done"] as AdminTask["status"][]).map((status) => (
                    <div key={status} className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                      <p className="text-sm font-bold text-slate-700 capitalize mb-3">{status.replace("_", " ")}</p>
                      <div className="space-y-2">
                        {tasks.filter((t) => t.status === status).map((task) => (
                          <div key={task.id} className="rounded-xl bg-white border border-slate-100 p-3 hover:shadow-md transition">
                            <button className="w-full text-left" onClick={() => { setSelectedAdminTaskId(task.id); setAdminTaskNote(""); }}>
                              <p className="font-semibold text-sm text-slate-900 flex items-center gap-1.5">{task.title}{task.origin === "auto" && <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[9px] font-black text-indigo-600" title="Auto-assigned by the automation engine">⚙️ Auto</span>}</p>
                              <p className="text-xs text-slate-500 mt-1 capitalize">{task.department || "general"} · {task.priority} {task.due_date ? `· Due ${task.due_date}` : ""}</p>
                              {task.staff_notes && <p className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg p-2 mt-2 line-clamp-2">Staff update: {task.staff_notes}</p>}
                              <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-primary-500" style={{ width: `${task.progress ?? 0}%` }} /></div>
                              <p className="text-xs text-primary-700 font-bold mt-2">Open task →</p>
                            </button>
                            <div className="mt-3 grid grid-cols-2 gap-2">
                              <select className="input text-xs py-1.5" value={task.status} onChange={(e) => updateTaskStatus(task, e.target.value as AdminTask["status"])}><option value="pending">Assigned</option><option value="in_progress">In Progress</option><option value="blocked">Need Help</option><option value="done">Completed</option></select>
                              <input className="input text-xs py-1.5" type="number" min="0" max="100" value={task.progress ?? 0} onChange={(e) => updateTaskProgress(task, Number(e.target.value))} />
                            </div>
                          </div>
                        ))}
                        {tasks.filter((t) => t.status === status).length === 0 && <p className="text-xs text-slate-400">No tasks</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </section>
        )}

        {active === "finance" && (
          <section className="space-y-6">
            <AdminRevenueIntelligence />
            <SectionHeader title="Revenue & Finance" subtitle="Revenue, ads income, expenses, receivables, balance aur reports track karo" />
            <div className="grid grid-cols-2 xl:grid-cols-6 gap-4">
              <Metric title="Total Revenue" value={formatMoney(financeReport.income, "INR")} icon="💰" />
              <Metric title="This Month" value={formatMoney(financeReport.monthlyRevenue, "INR")} icon="📅" />
              <Metric title="Today" value={formatMoney(financeReport.todayRevenue, "INR")} icon="📈" />
              <Metric title="Pending" value={formatMoney(financeReport.pending, "INR")} icon="⏳" />
              <Metric title="Expenses" value={formatMoney(financeReport.expenses, "INR")} icon="💸" />
              <Metric title="Net Profit" value={formatMoney(financeReport.net, "INR")} icon="🏦" />
            </div>

            <div className="grid xl:grid-cols-[420px_1fr] gap-6">
              <div className="space-y-6">
                <Card className="p-5 h-fit">
                  <h2 className="text-lg font-semibold text-slate-900 mb-1">Add Finance Entry</h2>
                  <p className="text-sm text-slate-500 mb-4">Record subscription income, advertising revenue, manual income, expenses, and pending settlements.</p>
                  <form onSubmit={handleAddFinance} className="space-y-3">
                    <input className="input" type="date" value={financeForm.entry_date} onChange={(e) => setFinanceForm({ ...financeForm, entry_date: e.target.value })} />
                    <input className="input" required placeholder="Title e.g. July Pro Subscription" value={financeForm.title} onChange={(e) => setFinanceForm({ ...financeForm, title: e.target.value })} />
                    <div className="grid grid-cols-2 gap-2">
                      <select className="input" value={financeForm.type} onChange={(e) => setFinanceForm({ ...financeForm, type: e.target.value as AdminFinanceEntry["type"] })}>
                        <option value="income">Income</option>
                        <option value="expense">Expense</option>
                        <option value="receivable">Receivable</option>
                      </select>
                      <select className="input" value={financeForm.source} onChange={(e) => setFinanceForm({ ...financeForm, source: e.target.value as AdminFinanceEntry["source"] })}>
                        <option value="manual">Manual</option>
                        <option value="subscription">Subscription</option>
                        <option value="ads">Ads</option>
                        <option value="invoice">Invoice</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-[1fr_90px] gap-2">
                      <input className="input" type="number" min="0" step="0.01" value={financeForm.amount} onChange={(e) => setFinanceForm({ ...financeForm, amount: Number(e.target.value) })} />
                      <input className="input" value={financeForm.currency} onChange={(e) => setFinanceForm({ ...financeForm, currency: e.target.value.toUpperCase() })} />
                    </div>
                    <select className="input" value={financeForm.status} onChange={(e) => setFinanceForm({ ...financeForm, status: e.target.value as AdminFinanceEntry["status"] })}>
                      <option value="received">Received</option>
                      <option value="pending">Pending</option>
                      <option value="spent">Spent</option>
                    </select>
                    <textarea className="input min-h-20" placeholder="Notes / bank / ad network / payment reference" value={financeForm.notes ?? ""} onChange={(e) => setFinanceForm({ ...financeForm, notes: e.target.value })} />
                    <button className="btn-primary w-full" type="submit">Add Entry</button>
                  </form>
                </Card>

                <Card className="p-5">
                  <h2 className="text-lg font-semibold text-slate-900 mb-4">Source Breakdown</h2>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between"><span className="text-sm text-slate-500">Subscription</span><strong>{formatMoney(financeReport.subscriptionRevenue, "INR")}</strong></div>
                    <div className="flex items-center justify-between"><span className="text-sm text-slate-500">Ads</span><strong>{formatMoney(financeReport.adsRevenue, "INR")}</strong></div>
                    <div className="flex items-center justify-between"><span className="text-sm text-slate-500">Manual/Other</span><strong>{formatMoney(Math.max(0, financeReport.income - financeReport.subscriptionRevenue - financeReport.adsRevenue), "INR")}</strong></div>
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between"><span className="text-sm font-semibold text-slate-700">Net Balance</span><strong className={financeReport.net >= 0 ? "text-green-600" : "text-red-600"}>{formatMoney(financeReport.net, "INR")}</strong></div>
                  </div>
                </Card>
              </div>

              <div className="space-y-6">
                <Card className="p-5">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">Finance Report</h2>
                      <p className="text-sm text-slate-500">Last 7 days income vs expenses</p>
                    </div>
                    <select className="input md:w-36" value={financeRange} onChange={(e) => setFinanceRange(e.target.value as typeof financeRange)}>
                      <option value="7">7 days</option>
                      <option value="30">30 days</option>
                      <option value="90">90 days</option>
                      <option value="all">All time</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-7 gap-2 items-end h-36">
                    {financeReport.trend.map((day) => {
                      const maxValue = Math.max(...financeReport.trend.map((d) => Math.max(d.income, d.expense)), 1);
                      return (
                        <div key={day.key} className="flex flex-col items-center gap-1">
                          <div className="w-full flex items-end gap-1 h-24">
                            <div className="flex-1 bg-green-200 rounded-t" style={{ height: `${Math.max(6, (day.income / maxValue) * 96)}px` }} title={`Income ${formatMoney(day.income, "INR")}`} />
                            <div className="flex-1 bg-red-200 rounded-t" style={{ height: `${Math.max(6, (day.expense / maxValue) * 96)}px` }} title={`Expense ${formatMoney(day.expense, "INR")}`} />
                          </div>
                          <span className="text-[10px] text-slate-400">{day.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </Card>

                <Card>
                  <div className="p-5 border-b border-slate-100">
                    <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold text-slate-900">Finance Ledger</h2>
                        <p className="text-sm text-slate-500">Income, expense, ads aur pending entries manage karo.</p>
                      </div>
                      <div className="grid sm:grid-cols-4 gap-2 xl:w-[720px]">
                        <input className="input" placeholder="Search ledger..." value={financeSearch} onChange={(e) => setFinanceSearch(e.target.value)} />
                        <select className="input" value={financeStatusFilter} onChange={(e) => setFinanceStatusFilter(e.target.value as typeof financeStatusFilter)}>
                          <option value="all">All status</option>
                          <option value="received">Received</option>
                          <option value="pending">Pending</option>
                          <option value="spent">Spent</option>
                        </select>
                        <select className="input" value={financeSourceFilter} onChange={(e) => setFinanceSourceFilter(e.target.value as typeof financeSourceFilter)}>
                          <option value="all">All source</option>
                          <option value="subscription">Subscription</option>
                          <option value="ads">Ads</option>
                          <option value="manual">Manual</option>
                          <option value="invoice">Invoice</option>
                          <option value="other">Other</option>
                        </select>
                        <button className="btn-secondary" type="button" onClick={() => exportCsv(financeReport.visible, "finance-ledger.csv")}>Export CSV</button>
                      </div>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/50">
                          <th className="text-left text-xs font-semibold text-slate-500 uppercase px-5 py-3">Date</th>
                          <th className="text-left text-xs font-semibold text-slate-500 uppercase px-5 py-3">Title</th>
                          <th className="text-left text-xs font-semibold text-slate-500 uppercase px-5 py-3">Type</th>
                          <th className="text-left text-xs font-semibold text-slate-500 uppercase px-5 py-3">Source</th>
                          <th className="text-right text-xs font-semibold text-slate-500 uppercase px-5 py-3">Amount</th>
                          <th className="text-right text-xs font-semibold text-slate-500 uppercase px-5 py-3">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {financeReport.visible.length === 0 ? (
                          <tr><td colSpan={6} className="p-8 text-center text-sm text-slate-500">No finance entries found.</td></tr>
                        ) : financeReport.visible.map((entry) => (
                          <tr key={entry.id}>
                            <td className="px-5 py-3.5 text-sm text-slate-500">{entry.entry_date}</td>
                            <td className="px-5 py-3.5">
                              <p className="font-medium text-slate-900">{entry.title}</p>
                              <p className="text-xs text-slate-500 line-clamp-1">{entry.notes || "No notes"}</p>
                            </td>
                            <td className="px-5 py-3.5"><Pill className={entry.type === "expense" ? "bg-red-50 text-red-700" : entry.type === "receivable" ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"}>{entry.type}</Pill></td>
                            <td className="px-5 py-3.5 text-sm text-slate-600 capitalize">{entry.source}<div><Pill className={statusClass(entry.status)}>{entry.status}</Pill></div></td>
                            <td className={cx("px-5 py-3.5 text-right font-bold", entry.type === "expense" ? "text-red-600" : "text-green-600")}>{entry.type === "expense" ? "-" : "+"}{formatMoney(Number(entry.amount), entry.currency)}</td>
                            <td className="px-5 py-3.5 text-right">
                              <div className="flex justify-end gap-2">
                                {(entry.status === "pending" || entry.type === "receivable") && <button className="btn-secondary text-xs py-1.5" onClick={() => markFinanceReceived(entry)}>Mark Paid</button>}
                                <button className="btn-danger text-xs py-1.5" onClick={() => deleteFinanceEntry(entry)}>Delete</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
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
          <section className="space-y-6">
            <div className="flex flex-col lg:flex-row gap-3 lg:items-end lg:justify-between">
              <SectionHeader title="Analytics & AI Insights" subtitle="Business health, growth, revenue trends aur automatic insights" />
              <div className="flex gap-2 flex-wrap">
                <button className="btn-secondary" onClick={() => exportCsv(analytics.customerRevenue as unknown as Record<string, unknown>[], "top-customers-report.csv")}>Export Customers</button>
                <button className="btn-secondary" onClick={() => exportCsv(analytics.insights as unknown as Record<string, unknown>[], "ai-insights-report.csv")}>Export Insights</button>
              </div>
            </div>

            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <Metric title="Total Revenue" value={formatMoney(analytics.totalRevenue, "INR")} icon="💰" />
              <Metric title="Net Profit" value={formatMoney(analytics.netProfit, "INR")} icon="📈" />
              <Metric title="Active Users" value={String(analytics.activeUsers)} icon="✅" />
              <Metric title="Pro Conversion" value={`${analytics.conversionRate.toFixed(1)}%`} icon="⭐" />
            </div>

            <div className="grid xl:grid-cols-[1.2fr_0.8fr] gap-6">
              <Card className="p-5">
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">14-Day Growth Trend</h2>
                    <p className="text-sm text-slate-500">Users, invoices aur paid invoice revenue ka daily view.</p>
                  </div>
                  <Pill className={analytics.revenueGrowth >= 0 ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}>
                    {analytics.revenueGrowth >= 0 ? "+" : ""}{analytics.revenueGrowth.toFixed(1)}% month
                  </Pill>
                </div>
                <div className="space-y-5">
                  <MiniBarChart title="New Users" rows={analytics.userGrowth.map((item) => ({ label: item.label, value: item.count }))} />
                  <MiniBarChart title="Invoices Created" rows={analytics.invoiceGrowth.map((item) => ({ label: item.label, value: item.count }))} />
                  <MiniBarChart title="Paid Invoice Revenue" rows={analytics.invoiceGrowth.map((item) => ({ label: item.label, value: item.revenue }))} money />
                </div>
              </Card>

              <Card className="p-5">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">AI Business Insights</h2>
                <div className="space-y-3">
                  {analytics.insights.map((insight) => (
                    <div key={insight.title} className={cx(
                      "rounded-xl border p-4",
                      insight.tone === "green" && "bg-green-50 border-green-100",
                      insight.tone === "amber" && "bg-amber-50 border-amber-100",
                      insight.tone === "red" && "bg-red-50 border-red-100",
                      insight.tone === "slate" && "bg-slate-50 border-slate-100"
                    )}>
                      <p className="font-semibold text-slate-900">{insight.title}</p>
                      <p className="text-sm text-slate-600 mt-1">{insight.body}</p>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <div className="grid xl:grid-cols-3 gap-6">
              <Card className="p-5">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Top Countries</h2>
                <div className="space-y-3">
                  {analytics.topCountries.length === 0 ? <p className="text-sm text-slate-500">No country data yet.</p> : analytics.topCountries.map(([country, count]) => (
                    <div key={country} className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-slate-700">{country}</span>
                      <div className="flex items-center gap-2 flex-1 justify-end">
                        <div className="h-2 rounded-full bg-slate-100 w-28 overflow-hidden"><div className="h-full bg-primary-500" style={{ width: `${Math.max(8, (count / Math.max(1, profiles.length)) * 100)}%` }} /></div>
                        <span className="text-sm font-semibold text-slate-900 w-8 text-right">{count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-5 xl:col-span-2">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-slate-900">Top Customers</h2>
                  <span className="text-xs text-slate-500">Based on paid invoice revenue</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="border-b border-slate-100 bg-slate-50/50"><th className="text-left text-xs font-semibold text-slate-500 uppercase px-4 py-3">Customer</th><th className="text-left text-xs font-semibold text-slate-500 uppercase px-4 py-3">Invoices</th><th className="text-right text-xs font-semibold text-slate-500 uppercase px-4 py-3">Revenue</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {analytics.customerRevenue.length === 0 ? <tr><td colSpan={3} className="p-6 text-center text-sm text-slate-500">No customer revenue yet.</td></tr> : analytics.customerRevenue.map((customer) => (
                        <tr key={customer.id}>
                          <td className="px-4 py-3"><p className="font-medium text-slate-900">{customer.name}</p><p className="text-xs text-slate-500">{customer.email}</p></td>
                          <td className="px-4 py-3 text-sm text-slate-600">{customer.invoices}</td>
                          <td className="px-4 py-3 text-right font-bold text-slate-900">{formatMoney(customer.revenue, "INR")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>

            <div className="grid md:grid-cols-4 gap-4">
              <Metric title="New Users 7d" value={String(analytics.newUsers7)} icon="🆕" />
              <Metric title="New Users 30d" value={String(analytics.newUsers30)} icon="📅" />
              <Metric title="Overdue Amount" value={formatMoney(analytics.overdueAmount, "INR")} icon="⚠️" />
              <Metric title="Pending Collection" value={formatMoney(analytics.pendingFinance, "INR")} icon="⏳" />
            </div>
          </section>
        )}
        {active === "support" && <AdminSupportCenter profiles={profiles} team={team} />}
        {false && active === "support" && (
          <section className="space-y-6">
            <SectionHeader title="Support Center" subtitle="Tickets create, assign, resolve aur track karo" />
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <Metric title="Open" value={String(supportTickets.filter((t) => t.status === "open").length)} icon="🎫" />
              <Metric title="Pending" value={String(supportTickets.filter((t) => t.status === "pending").length)} icon="⏳" />
              <Metric title="Resolved" value={String(supportTickets.filter((t) => t.status === "resolved").length)} icon="✅" />
              <Metric title="Urgent" value={String(supportTickets.filter((t) => t.priority === "urgent").length)} icon="🚨" />
            </div>
            <div className="grid xl:grid-cols-[420px_1fr] gap-6">
              <Card className="p-5 h-fit">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Create Ticket</h2>
                <form onSubmit={handleCreateSupportTicket} className="space-y-3">
                  <select className="input" value={supportForm.user_id} onChange={(e) => setSupportForm({ ...supportForm, user_id: e.target.value })}>
                    <option value="">No user selected</option>{profiles.map((p) => <option key={p.id} value={p.id}>{p.business_name || p.email || p.id}</option>)}
                  </select>
                  <input className="input" required placeholder="Subject" value={supportForm.subject} onChange={(e) => setSupportForm({ ...supportForm, subject: e.target.value })} />
                  <textarea className="input min-h-24" placeholder="User message / issue" value={supportForm.message} onChange={(e) => setSupportForm({ ...supportForm, message: e.target.value })} />
                  <div className="grid grid-cols-2 gap-2">
                    <select className="input" value={supportForm.priority} onChange={(e) => setSupportForm({ ...supportForm, priority: e.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select>
                    <select className="input" value={supportForm.assigned_to} onChange={(e) => setSupportForm({ ...supportForm, assigned_to: e.target.value })}><option value="">Unassigned</option>{supportAgents.map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}</select>
                  </div>
                  <textarea className="input min-h-20" placeholder="Internal notes" value={supportForm.internal_notes} onChange={(e) => setSupportForm({ ...supportForm, internal_notes: e.target.value })} />
                  <button className="btn-primary w-full" type="submit">Create Ticket</button>
                </form>
              </Card>
              <div className="space-y-6">
                <Card>
                  <div className="p-5 border-b border-slate-100 flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
                    <h2 className="text-lg font-semibold text-slate-900">Ticket Inbox</h2>
                    <div className="flex gap-2 flex-wrap">
                      <input className="input lg:w-72" placeholder="Search tickets..." value={supportSearch} onChange={(e) => setSupportSearch(e.target.value)} />
                      <select className="input w-40" value={supportStatusFilter} onChange={(e) => setSupportStatusFilter(e.target.value as typeof supportStatusFilter)}><option value="all">All Status</option><option value="open">Open</option><option value="pending">Pending</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select>
                      <button className="btn-secondary" onClick={() => exportCsv(filteredSupportTickets as unknown as Record<string, unknown>[], "support-tickets.csv")}>Export CSV</button>
                    </div>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {filteredSupportTickets.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No support tickets found.</p> : filteredSupportTickets.map((t) => (
                      <button key={t.id} className={cx("w-full p-5 text-left flex items-center justify-between hover:bg-slate-50", selectedTicket?.id === t.id && "bg-primary-50/40")} onClick={() => setSelectedTicketId(t.id)}>
                        <div><p className="font-medium text-slate-900">{t.subject}</p><p className="text-sm text-slate-500 line-clamp-1">{t.message || "No message"}</p><p className="text-xs text-slate-400 mt-1">{formatDate(t.created_at)}</p></div>
                        <div className="flex gap-2"><Pill className={statusClass(t.priority)}>{t.priority}</Pill><Pill className={statusClass(t.status)}>{t.status}</Pill></div>
                      </button>
                    ))}
                  </div>
                </Card>
                <Card className="p-5">
                  <h2 className="text-lg font-semibold text-slate-900 mb-4">Ticket Detail</h2>
                  {selectedTicket ? (
                    <div className="space-y-4">
                      <div className="flex items-start justify-between gap-3"><div><p className="text-xl font-bold text-slate-900">{selectedTicket.subject}</p><p className="text-sm text-slate-500">{selectedTicket.message || "No message"}</p></div><Pill className={statusClass(selectedTicket.status)}>{selectedTicket.status}</Pill></div>
                      <div className="grid md:grid-cols-3 gap-3"><Info label="Priority" value={selectedTicket.priority} /><Info label="Created" value={formatDate(selectedTicket.created_at)} /><Info label="Assigned" value={team.find((m) => m.id === selectedTicket.assigned_to)?.name || team.find((m) => m.id === selectedTicket.assigned_to)?.email || "Unassigned"} /></div>
                      <div className="grid md:grid-cols-3 gap-2">
                        <select className="input" value={selectedTicket.status} onChange={(e) => updateTicketStatus(selectedTicket, e.target.value as AdminSupportTicket["status"])}><option value="open">Open</option><option value="pending">Pending</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select>
                        <select className="input" value={selectedTicket.priority} onChange={(e) => updateTicketPriority(selectedTicket, e.target.value as AdminSupportTicket["priority"])}><option value="low">Low</option><option value="medium">Normal</option><option value="high">High</option><option value="urgent">Highest</option></select>
                        <select className="input" value={selectedTicket.assigned_to || ""} onChange={(e) => updateTicketAssignment(selectedTicket, e.target.value)}><option value="">Unassigned</option>{supportAgents.map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}</select>
                      </div>
                      {supportAttachments.length > 0 && <div className="rounded-xl border border-slate-200 p-4"><p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Customer screenshots</p><div className="grid grid-cols-2 md:grid-cols-4 gap-3">{supportAttachments.map((item) => <a key={item.id} href={item.signed_url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl border bg-white"><img src={item.signed_url} alt={item.file_name} className="h-28 w-full object-cover"/><p className="truncate p-2 text-xs text-slate-600">{item.file_name}</p></a>)}</div></div>}
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Conversation</p>
                        <div className="max-h-72 overflow-y-auto space-y-2">{supportMessages.length === 0 ? <p className="text-sm text-slate-500">No messages yet.</p> : supportMessages.map((m) => <div key={m.id} className={cx("rounded-xl p-3 text-sm", m.is_internal ? "bg-amber-50 border border-amber-200" : m.author_type === "customer" ? "bg-white border border-slate-200" : "bg-primary-50 border border-primary-100")}><div className="mb-1 flex justify-between gap-3 text-xs text-slate-500"><span className="font-semibold">{m.is_internal ? "Internal note" : m.author_type === "customer" ? "Customer" : "Rivox Admin"}</span><span>{formatDate(m.created_at)}</span></div><p className="whitespace-pre-wrap text-slate-700">{m.message}</p></div>)}</div>
                        <form onSubmit={sendAdminSupportReply} className="space-y-2"><textarea className="input min-h-24" placeholder="Write a reply..." value={supportReply} onChange={(e) => setSupportReply(e.target.value)} /><label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={supportInternal} onChange={(e) => setSupportInternal(e.target.checked)} /> Internal note (hidden from customer)</label><button className="btn-primary" disabled={!supportReply.trim()}>{supportInternal ? "Add internal note" : "Send reply"}</button></form>
                      </div>
                      {selectedTicket.internal_notes && <div className="rounded-xl bg-slate-50 border border-slate-100 p-4"><p className="text-xs text-slate-500 mb-1">Internal Notes</p><p className="text-sm text-slate-700 whitespace-pre-wrap">{selectedTicket.internal_notes}</p></div>}
                      <button className="btn-danger" onClick={() => deleteTicket(selectedTicket)}>Delete Ticket</button>
                    </div>
                  ) : <p className="text-sm text-slate-500">Select a ticket.</p>}
                </Card>
              </div>
            </div>
          </section>
        )}
        {active === "audit" && (
          <section className="space-y-6">
            <AdminAccessGovernance />
            <SectionHeader title="Audit Logs" subtitle="Admin actions ka searchable security history" />
            <Card>
              <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                <h2 className="text-lg font-semibold text-slate-900">Action History</h2>
                <div className="flex gap-2"><input className="input sm:w-80" placeholder="Search action, target, details..." value={auditSearch} onChange={(e) => setAuditSearch(e.target.value)} /><button className="btn-secondary" onClick={() => exportCsv(filteredAuditLogs as unknown as Record<string, unknown>[], "audit-logs.csv")}>Export CSV</button></div>
              </div>
              <div className="overflow-x-auto"><table className="w-full"><thead><tr className="border-b border-slate-100 bg-slate-50/50"><th className="text-left text-xs font-semibold text-slate-500 uppercase px-5 py-3">Time</th><th className="text-left text-xs font-semibold text-slate-500 uppercase px-5 py-3">Action</th><th className="text-left text-xs font-semibold text-slate-500 uppercase px-5 py-3">Target</th><th className="text-left text-xs font-semibold text-slate-500 uppercase px-5 py-3">Details</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredAuditLogs.length === 0 ? <tr><td colSpan={4} className="p-8 text-center text-sm text-slate-500">No audit logs found.</td></tr> : filteredAuditLogs.map((log) => <tr key={log.id}><td className="px-5 py-3.5 text-sm text-slate-500">{formatDate(log.created_at)}</td><td className="px-5 py-3.5 font-medium text-slate-900">{log.action}</td><td className="px-5 py-3.5 text-sm text-slate-600">{log.target_type || "—"} {log.target_id || ""}</td><td className="px-5 py-3.5 text-xs text-slate-500 max-w-md truncate">{JSON.stringify(log.details ?? {})}</td></tr>)}</tbody></table></div>
            </Card>
          </section>
        )}
        {active === "system" && (
          <section className="space-y-6">
            <AdminSecurityCenter />
            <AdminSystemMonitor team={team} />
            <SectionHeader title="System Center" subtitle="Maintenance mode, feature flags, permissions aur security controls" />
            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
              <Metric title="DB Tables" value="12+" icon="🗄️" />
              <Metric title="Edge Functions" value="2" icon="⚡" />
              <Metric title="Admin Logs" value={String(auditLogs.length)} icon="📝" />
              <Metric title="Security" value={systemSettings.security_level} icon="🛡️" />
            </div>

            <div className="grid xl:grid-cols-2 gap-6">
              <Card className="p-5 space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Maintenance Mode</h2>
                  <p className="text-sm text-slate-500">Emergency me public site ko pause karne ke liye.</p>
                </div>
                <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-4">
                  <span><span className="font-medium text-slate-900">Enable maintenance</span><span className="block text-sm text-slate-500">Users ko maintenance message dikhega.</span></span>
                  <input type="checkbox" checked={systemSettings.maintenance_mode} onChange={(e) => updateSystemSetting("maintenance_mode", e.target.checked)} />
                </label>
                <textarea className="input min-h-24" value={systemSettings.maintenance_message} onChange={(e) => updateSystemSetting("maintenance_message", e.target.value)} />
                <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={systemSettings.allow_admin_bypass} onChange={(e) => updateSystemSetting("allow_admin_bypass", e.target.checked)} /> Allow owner/admin bypass</label>
              </Card>

              <Card className="p-5 space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Feature Flags</h2>
                  <p className="text-sm text-slate-500">Future releases ko safely ON/OFF karo.</p>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {[
                    ["public_signup", "Public Signup"],
                    ["invoice_sharing", "Invoice Sharing"],
                    ["credits_system", "Invoice Balance System"],
                    ["team_portal", "Team Portal"],
                    ["ai_insights", "AI Insights"],
                    ["ads_enabled", "Ads Enabled"],
                  ].map(([key, label]) => (
                    <label key={key} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3 text-sm font-medium text-slate-700">
                      {label}
                      <input type="checkbox" checked={Boolean(systemSettings[key as keyof AdminSystemSettings])} onChange={(e) => updateSystemSetting(key as keyof AdminSystemSettings, e.target.checked as never)} />
                    </label>
                  ))}
                </div>
              </Card>
            </div>

            <div className="grid xl:grid-cols-[1.2fr_0.8fr] gap-6">
              <Card className="p-5">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Role & Permission Matrix</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-slate-100 bg-slate-50"><th className="text-left px-4 py-3">Role</th><th className="text-left px-4 py-3">Access</th><th className="text-left px-4 py-3">Risk</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {Object.entries(roleAccess).map(([role, access]) => (
                        <tr key={role}>
                          <td className="px-4 py-3 font-semibold text-slate-900">{roleLabels[role as AdminTeamMember["role"]]}</td>
                          <td className="px-4 py-3 text-slate-600">{access.join(", ")}</td>
                          <td className="px-4 py-3"><Pill className={role === "full_access" ? statusClass("urgent") : role === "finance" ? statusClass("pending") : statusClass("closed")}>{role === "full_access" ? "High" : role === "finance" ? "Medium" : "Low"}</Pill></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card className="p-5 space-y-4">
                <h2 className="text-lg font-semibold text-slate-900">Security Controls</h2>
                <select className="input" value={systemSettings.security_level} onChange={(e) => updateSystemSetting("security_level", e.target.value as AdminSystemSettings["security_level"])}>
                  <option value="standard">Standard</option>
                  <option value="strict">Strict</option>
                  <option value="locked">Locked</option>
                </select>
                <input className="input" value={systemSettings.default_currency} onChange={(e) => updateSystemSetting("default_currency", e.target.value.toUpperCase())} placeholder="Default currency" />
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 text-sm text-slate-600 space-y-2">
                  <p><strong>Owner:</strong> {ADMIN_EMAIL}</p>
                  <p><strong>Reserved signup:</strong> active</p>
                  <p><strong>Audit logging:</strong> enabled</p>
                  <p><strong>RLS:</strong> admin policies required</p>
                </div>
                <button className="btn-primary w-full" onClick={saveSystemSettings} disabled={savingSystem}>{savingSystem ? "Saving..." : "Save System Settings"}</button>
              </Card>
            </div>
          </section>
        )}
        {active === "qa" && (
          <section className="space-y-6">
            <AdminProductionQA />
            <SectionHeader title="Production QA Center" subtitle="Final checklist for auth, admin backend, RLS and production readiness" />
            <div className="grid md:grid-cols-4 gap-4">
              <Metric title="QA Score" value={`${qaChecks.score}%`} icon="✅" />
              <Metric title="Passed Checks" value={`${qaChecks.passed}/${qaChecks.total}`} icon="🧪" />
              <Metric title="Audit Logs" value={String(auditLogs.length)} icon="📝" />
              <Metric title="Open Tickets" value={String(supportTickets.filter((t) => t.status === "open" || t.status === "pending").length)} icon="🎫" />
            </div>
            <Card className="p-6">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Production verification checklist</h2>
                  <p className="text-sm text-slate-500">Run this after every deployment. Review items need manual testing before launch.</p>
                </div>
                <button
                  className="btn-secondary"
                  onClick={() => exportCsv(qaChecks.checks.map((item) => ({ Area: item.area, Check: item.check, Status: item.status, Detail: item.detail })), `rivox-production-qa-${new Date().toISOString().slice(0, 10)}.csv`)}
                >
                  Export QA CSV
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                      <th className="py-3 pr-4">Area</th>
                      <th className="py-3 pr-4">Check</th>
                      <th className="py-3 pr-4">Status</th>
                      <th className="py-3 pr-4">Detail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {qaChecks.checks.map((item) => (
                      <tr key={`${item.area}-${item.check}`}>
                        <td className="py-3 pr-4 font-semibold text-slate-800">{item.area}</td>
                        <td className="py-3 pr-4 text-slate-700">{item.check}</td>
                        <td className="py-3 pr-4"><Pill className={item.status === "pass" ? "bg-green-50 text-green-700 border-green-200" : "bg-amber-50 text-amber-700 border-amber-200"}>{item.status}</Pill></td>
                        <td className="py-3 pr-4 text-slate-500">{item.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <Card className="p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-3">Manual test order</h2>
              <div className="grid md:grid-cols-2 gap-3 text-sm">
                {[
                  "Logout, login as owner admin, open /admin",
                  "Create test user, verify phone flow, create invoice",
                  "Admin: add invoice balance, give free pro, ban/unban user",
                  "Create team member and deploy create-team-member edge function",
                  "Create finance income/expense and export CSV",
                  "Create support ticket, assign, resolve, check audit log",
                  "Open shared invoice in incognito without Vercel protection",
                  "Check mobile layout and browser console red errors",
                ].map((item) => (
                  <div key={item} className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-slate-700">{item}</div>
                ))}
              </div>
            </Card>
          </section>
        )}

        {active === "settings" && (
          <Placeholder title="Admin Settings" subtitle="Owner email, permissions aur platform controls" items={[`Owner admin: ${ADMIN_EMAIL}`, "System Center added for maintenance, flags and security", "Team roles: Full Access, Limited, Support, Finance, Viewer", "Next: production audit and bug fixing"]} />
        )}


        {balanceModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200">
              <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Add Invoice Balance</h2>
                  <p className="text-sm text-slate-500">Add the exact number of extra invoices this user can create.</p>
                </div>
                <button className="text-slate-400 hover:text-slate-700 text-xl" onClick={() => setBalanceModal(null)}>×</button>
              </div>
              <div className="p-5 space-y-4">
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
                  <p className="font-semibold text-slate-900">{balanceModal.profile.business_name || balanceModal.profile.email || "Selected user"}</p>
                  <p className="text-sm text-slate-500">Current added balance: <span className="font-semibold text-slate-900">{Number((balanceModal.profile as unknown as { credits?: number }).credits ?? 0)}</span> invoices</p>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[5, 10, 25, 50].map((amount) => (
                    <button key={amount} className="btn-secondary text-sm" onClick={() => setBalanceModal({ ...balanceModal, amount: String(amount) })}>+{amount}</button>
                  ))}
                </div>
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
                  After add: <span className="font-bold">{Number((balanceModal.profile as unknown as { credits?: number }).credits ?? 0) + Math.max(0, Math.floor(Number(balanceModal.amount) || 0))}</span> added invoices available.
                </div>
                <label className="block text-sm font-medium text-slate-700">Invoices to add</label>
                <input className="input" type="number" min="1" step="1" placeholder="Enter exact number, e.g. 1" value={balanceModal.amount} onChange={(e) => setBalanceModal({ ...balanceModal, amount: e.target.value })} />
                <label className="block text-sm font-medium text-slate-700">Reason</label>
                <select className="input" value={balanceModal.reason} onChange={(e) => setBalanceModal({ ...balanceModal, reason: e.target.value })}>
                  <option>Manual admin adjustment</option>
                  <option>Promotion</option>
                  <option>Refund / compensation</option>
                  <option>Customer support goodwill</option>
                  <option>Testing</option>
                </select>
              </div>
              <div className="p-5 border-t border-slate-100 flex justify-end gap-2">
                <button className="btn-secondary" onClick={() => setBalanceModal(null)}>Cancel</button>
                <button className="btn-primary" disabled={adminActionBusy} onClick={() => submitInvoiceBalance()}>{adminActionBusy ? "Saving..." : "Add Balance"}</button>
              </div>
            </div>
          </div>
        )}

        {selectedAdminTask && (
          <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm p-4 flex items-center justify-center">
            <div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-3xl bg-white shadow-2xl border border-slate-200">
              <div className="p-6 border-b border-slate-100 flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Task Review & Approval</p>
                  <h2 className="text-2xl font-black text-slate-950 mt-1">{selectedAdminTask.title}</h2>
                  <p className="text-sm text-slate-500 mt-1 capitalize">{selectedAdminTask.department || "general"} · {selectedAdminTask.priority} · {adminTaskStatusLabel(selectedAdminTask.status)}</p>
                </div>
                <button className="btn-secondary" onClick={() => setSelectedAdminTaskId(null)}>Close</button>
              </div>
              <div className="p-6 grid lg:grid-cols-[1fr_320px] gap-6">
                <div className="space-y-5">
                  <div className="rounded-2xl bg-slate-50 border border-slate-100 p-5">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Task brief</p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{selectedAdminTask.description || "No description provided."}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-5">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Staff updates</p>
                    <div className="min-h-[90px] rounded-2xl bg-blue-50 border border-blue-100 p-4 text-sm text-blue-950 whitespace-pre-wrap">{selectedAdminTask.staff_notes || "No staff update yet."}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-5">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Admin notes</p>
                    <div className="min-h-[80px] rounded-2xl bg-slate-50 border border-slate-100 p-4 text-sm text-slate-700 whitespace-pre-wrap">{selectedAdminTask.internal_notes || "No admin notes yet."}</div>
                    <textarea value={adminTaskNote} onChange={(e) => setAdminTaskNote(e.target.value)} placeholder="Write review note or instruction for staff..." className="input min-h-24 mt-3" />
                    <button className="btn-primary mt-3" disabled={!adminTaskNote.trim()} onClick={() => addAdminTaskNote(selectedAdminTask)}>Add Note</button>
                  </div>
                </div>
                <div className="space-y-4">
                  <Card className="p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">Status</p>
                    <select className="input mb-2" value={selectedAdminTask.status} onChange={(e) => updateTaskStatus(selectedAdminTask, e.target.value as AdminTask["status"])}><option value="pending">Assigned</option><option value="in_progress">In Progress</option><option value="blocked">Need Help</option><option value="done">Completed</option></select>
                    <input className="input" type="number" min="0" max="100" value={selectedAdminTask.progress ?? 0} onChange={(e) => updateTaskProgress(selectedAdminTask, Number(e.target.value))} />
                    <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-primary-500" style={{ width: `${selectedAdminTask.progress ?? 0}%` }} /></div>
                  </Card>
                  <Card className="p-4 space-y-2">
                    <button className="btn-primary w-full" onClick={() => approveTask(selectedAdminTask)}>Approve task</button>
                    <button className="btn-secondary w-full" onClick={() => reopenTask(selectedAdminTask)}>Return / reopen</button>
                    <button className="w-full rounded-xl border border-red-200 text-red-700 px-4 py-2 text-sm font-semibold hover:bg-red-50" onClick={() => deleteTask(selectedAdminTask)}>Delete Task</button>
                  </Card>
                  <Card className="p-4 text-xs text-slate-500">
                    Review checklist: check staff updates/proof notes, verify customer result if needed, then Approve / Close or Reopen with instructions.
                  </Card>
                </div>
              </div>
            </div>
          </div>
        )}

        {freeProModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200">
              <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Give Free {freeProModal.plan === "business" ? "Business" : "Pro"}</h2>
                  <p className="text-sm text-slate-500">The expiry date is saved automatically. After it passes, the user returns to the Free plan.</p>
                </div>
                <button className="text-slate-400 hover:text-slate-700 text-xl" onClick={() => setFreeProModal(null)}>×</button>
              </div>
              <div className="p-5 space-y-4">
                <div className="rounded-xl bg-amber-50 border border-amber-100 p-4">
                  <p className="font-semibold text-slate-900">{freeProModal.profile.business_name || freeProModal.profile.email || "Selected user"}</p>
                  <p className="text-sm text-amber-700">{freeProModal.plan === "business" ? "Business" : "Pro"} access tab tak active rahega jab tak selected duration expire nahi hoti.</p>
                </div>
                <label className="block text-sm font-medium text-slate-700">Plan</label>
                <div className="grid grid-cols-2 gap-2">
                  <button className={freeProModal.plan === "pro" ? "btn-primary text-sm" : "btn-secondary text-sm"} onClick={() => setFreeProModal({ ...freeProModal, plan: "pro" })}>Pro</button>
                  <button className={freeProModal.plan === "business" ? "btn-primary text-sm" : "btn-secondary text-sm"} onClick={() => setFreeProModal({ ...freeProModal, plan: "business" })}>Business</button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[7, 30, 90, 365].map((days) => (
                    <button key={days} className="btn-secondary text-sm" onClick={() => setFreeProModal({ ...freeProModal, days: String(days) })}>{days} days</button>
                  ))}
                </div>
                <label className="block text-sm font-medium text-slate-700">Custom days</label>
                <input className="input" type="number" min="1" value={freeProModal.days} onChange={(e) => setFreeProModal({ ...freeProModal, days: e.target.value })} />
                <label className="block text-sm font-medium text-slate-700">Reason</label>
                <select className="input" value={freeProModal.reason} onChange={(e) => setFreeProModal({ ...freeProModal, reason: e.target.value })}>
                  <option>Manual free {freeProModal.plan === "business" ? "Business" : "Pro"} access</option>
                  <option>Promotion</option>
                  <option>Trial extension</option>
                  <option>Support compensation</option>
                  <option>Testing</option>
                </select>
              </div>
              <div className="p-5 border-t border-slate-100 flex justify-end gap-2">
                <button className="btn-secondary" onClick={() => setFreeProModal(null)}>Cancel</button>
                <button className="btn-primary" disabled={adminActionBusy} onClick={() => submitFreePro()}>{adminActionBusy ? "Saving..." : `Give Free ${freeProModal.plan === "business" ? "Business" : "Pro"}`}</button>
              </div>
            </div>
          </div>
        )}

      </main>
      </div>
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


function MiniBarChart({ title, rows, money = false }: { title: string; rows: { label: string; value: number }[]; money?: boolean }) {
  const max = Math.max(1, ...rows.map((row) => Number(row.value) || 0));
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <p className="text-xs text-slate-500">Peak: {money ? formatMoney(max, "INR") : max}</p>
      </div>
      <div className="flex items-end gap-1 h-24 rounded-xl border border-slate-100 bg-slate-50 p-3">
        {rows.map((row) => (
          <div key={`${title}-${row.label}`} className="flex-1 h-full flex flex-col justify-end items-center gap-1" title={`${row.label}: ${money ? formatMoney(row.value, "INR") : row.value}`}>
            <div className="w-full rounded-t bg-primary-500/80 min-h-[4px]" style={{ height: `${Math.max(4, (Number(row.value) / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 mt-1 text-[10px] text-slate-400">
        {rows.filter((_, index) => index % 2 === 0).slice(-7).map((row) => <span key={`${title}-label-${row.label}`} className="truncate">{row.label}</span>)}
      </div>
    </div>
  );
}

function Placeholder({ title, subtitle, items }: { title: string; subtitle: string; items: string[] }) {
  return <section className="space-y-6"><SectionHeader title={title} subtitle={subtitle} /><Card className="p-6"><div className="grid md:grid-cols-2 gap-4">{items.map((item) => <div key={item} className="rounded-xl border border-slate-100 bg-slate-50 p-4"><p className="font-medium text-slate-900">{item}</p><p className="text-sm text-slate-500 mt-1">Ready for next production phase.</p></div>)}</div></Card></section>;
}
