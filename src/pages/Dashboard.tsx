import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import type { Invoice, Client } from "../lib/types";
import { formatDate, FREE_PLAN_LIMIT } from "../lib/constants";
import { formatMoney } from "../lib/currency";
import { invoiceBaseAmount, invoicePaidBaseAmount, invoiceDate, startOfDay, endOfDay, isWithin } from "../lib/invoiceAnalytics";

// Skeleton loader component
function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-slate-200 rounded ${className ?? ""}`} />
  );
}

// Analytics card component
function StatCard({
  label,
  value,
  icon,
  trend,
  trendValue,
  color = "primary",
  loading,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  color?: "primary" | "green" | "amber" | "red" | "blue";
  loading?: boolean;
}) {
  const colorClasses = {
    primary: "bg-primary-50 text-primary-600",
    green: "bg-green-50 text-green-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
    blue: "bg-blue-50 text-blue-600",
  };

  if (loading) {
    return (
      <div className="card p-5 hover:shadow-md transition-shadow duration-300">
        <Skeleton className="h-4 w-24 mb-3" />
        <Skeleton className="h-8 w-16 mb-2" />
        <Skeleton className="h-3 w-12" />
      </div>
    );
  }

  return (
    <div className="group relative overflow-hidden rounded-3xl border border-white/70 bg-white/90 p-5 shadow-[0_18px_50px_-26px_rgba(15,23,42,.35)] backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_60px_-24px_rgba(79,70,229,.35)]">
      <div className="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full bg-gradient-to-br from-violet-100 to-transparent opacity-80" />
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-500 mb-1">{label}</p>
          <p className="text-2xl font-bold text-slate-900">{value}</p>
          {trend && trendValue && (
            <div className="flex items-center gap-1 mt-2">
              {trend === "up" && (
                <svg
                  className="w-4 h-4 text-green-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                  />
                </svg>
              )}
              {trend === "down" && (
                <svg
                  className="w-4 h-4 text-red-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13 17h8m0 0v-8m0 8l-8-8-4 4-6-6"
                  />
                </svg>
              )}
              {trend === "neutral" && (
                <svg
                  className="w-4 h-4 text-slate-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 12h14"
                  />
                </svg>
              )}
              <span
                className={`text-xs font-medium ${
                  trend === "up"
                    ? "text-green-600"
                    : trend === "down"
                    ? "text-red-600"
                    : "text-slate-500"
                }`}
              >
                {trendValue}
              </span>
            </div>
          )}
        </div>
        <div
          className={`w-11 h-11 rounded-xl flex items-center justify-center ${colorClasses[color]} group-hover:scale-110 transition-transform duration-300`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

// Quick action card
function QuickActionCard({
  title,
  description,
  icon,
  to,
  onClick,
  disabled,
  comingSoon,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  to?: string;
  onClick?: () => void;
  disabled?: boolean;
  comingSoon?: boolean;
}) {
  const content = (
    <div className="group relative cursor-pointer overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white to-violet-50/40 p-5 shadow-[0_14px_40px_-28px_rgba(79,70,229,.55)] transition-all duration-300 hover:-translate-y-1 hover:border-violet-200 hover:shadow-[0_22px_50px_-24px_rgba(79,70,229,.45)]">
      {comingSoon && (
        <span className="absolute top-3 right-3 text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">
          Coming Soon
        </span>
      )}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-slate-600 group-hover:from-primary-100 group-hover:to-primary-200 group-hover:text-primary-600 transition-all duration-300">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-900 group-hover:text-primary-600 transition-colors">
            {title}
          </h3>
          <p className="text-sm text-slate-500 mt-0.5">{description}</p>
        </div>
        <svg
          className="w-5 h-5 text-slate-300 group-hover:text-primary-500 group-hover:translate-x-1 transition-all duration-300 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 5l7 7-7 7"
          />
        </svg>
      </div>
    </div>
  );

  if (disabled || comingSoon) {
    return <div className="opacity-60 pointer-events-none">{content}</div>;
  }

  if (to) {
    return <Link to={to}>{content}</Link>;
  }

  return (
    <button onClick={onClick} className="w-full text-left">
      {content}
    </button>
  );
}

// Activity feed item
function ActivityItem({
  type,
  title,
  description,
  timestamp,
  icon,
}: {
  type: "invoice" | "payment" | "client" | "overdue";
  title: string;
  description: string;
  timestamp: string;
  icon: React.ReactNode;
}) {
  const typeColors = {
    invoice: "bg-blue-100 text-blue-600",
    payment: "bg-green-100 text-green-600",
    client: "bg-purple-100 text-purple-600",
    overdue: "bg-red-100 text-red-600",
  };

  return (
    <div className="flex items-start gap-3 py-3">
      <div
        className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${typeColors[type]}`}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900">{title}</p>
        <p className="text-xs text-slate-500 mt-0.5">{description}</p>
      </div>
      <span className="text-xs text-slate-400 flex-shrink-0">{timestamp}</span>
    </div>
  );
}

// Revenue chart built from real paid invoices in the business base currency
function RevenueChart({
  period,
  currency,
  invoices,
}: {
  period: "7d" | "30d" | "year";
  currency: string;
  invoices: Invoice[];
}) {
  const now = new Date();
  const paid = invoices.filter((invoice) => invoice.status === "paid");
  const buckets: { label: string; value: number; start: Date; end: Date }[] = [];

  if (period === "year") {
    for (let month = 0; month < 12; month += 1) {
      const start = new Date(now.getFullYear(), month, 1);
      const end = new Date(now.getFullYear(), month + 1, 0, 23, 59, 59, 999);
      buckets.push({
        label: start.toLocaleDateString("en-US", { month: "short" }),
        start,
        end,
        value: 0,
      });
    }
  } else {
    const days = period === "7d" ? 7 : 30;
    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const date = new Date(now);
      date.setDate(now.getDate() - offset);
      buckets.push({
        label: date.toLocaleDateString("en-US", { day: "2-digit", month: "short" }),
        start: startOfDay(date),
        end: endOfDay(date),
        value: 0,
      });
    }
  }

  paid.forEach((invoice) => {
    const date = invoiceDate(invoice);
    const bucket = buckets.find((item) => isWithin(date, item.start, item.end));
    if (bucket) bucket.value += invoicePaidBaseAmount(invoice);
  });

  const data = buckets.map((bucket) => bucket.value);
  const total = data.reduce((sum, value) => sum + value, 0);
  const maxValue = Math.max(...data, 1);

  const currentStart = buckets[0]?.start ?? startOfDay(now);
  const currentEnd = buckets[buckets.length - 1]?.end ?? endOfDay(now);
  const duration = currentEnd.getTime() - currentStart.getTime() + 1;
  const previousEnd = new Date(currentStart.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - duration + 1);
  const previousTotal = paid
    .filter((invoice) => isWithin(invoiceDate(invoice), previousStart, previousEnd))
    .reduce((sum, invoice) => sum + invoicePaidBaseAmount(invoice), 0);
  const growth = previousTotal > 0 ? ((total - previousTotal) / previousTotal) * 100 : total > 0 ? 100 : 0;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_22px_70px_-35px_rgba(30,41,59,.4)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-600 via-indigo-500 to-cyan-400" />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Revenue Overview</h3>
          <p className="text-sm text-slate-500 mt-0.5">Paid revenue: {formatMoney(total, currency)}</p>
        </div>
        <div className={`text-sm font-medium ${growth >= 0 ? "text-green-600" : "text-red-600"}`}>
          {growth >= 0 ? "+" : ""}{growth.toFixed(1)}% <span className="font-normal text-slate-500">vs previous period</span>
        </div>
      </div>
      <div className="flex items-end gap-1.5 h-40">
        {buckets.map((bucket, index) => (
          <div key={`${bucket.label}-${index}`} className="group relative flex-1 bg-gradient-to-t from-primary-500 to-primary-400 rounded-t" style={{ height: `${Math.max((bucket.value / maxValue) * 100, bucket.value > 0 ? 4 : 1)}%` }}>
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
              {bucket.label}: {formatMoney(bucket.value, currency)}
            </div>
          </div>
        ))}
      </div>
      {total === 0 && <p className="mt-4 text-center text-sm text-slate-500">No paid revenue in this period.</p>}
    </div>
  );
}

export default function Dashboard() {
  const { user, profile, workspaceOwnerId, workspaceRole, workspaceName } = useAuth();
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartPeriod, setChartPeriod] = useState<"7d" | "30d" | "year">("30d");

  useEffect(() => {
  async function load() {
    if (!user) return;

    const [invoiceRes, clientRes] = await Promise.all([
      supabase
        .from("invoices")
        .select("*")
        .eq("user_id", workspaceOwnerId || user.id)
        .order("created_at", { ascending: false }),

      supabase
        .from("clients")
        .select("*")
        .eq("user_id", workspaceOwnerId || user.id)
        .order("created_at", { ascending: false }),
    ]);

    if (invoiceRes.data) setInvoices(invoiceRes.data as Invoice[]);
    if (clientRes.data) setClients(clientRes.data as Client[]);

    setLoading(false);
  }

  load();
}, [user, workspaceOwnerId]);

  // Calculate statistics
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const invoicesThisMonth = invoices.filter(
    (inv) => new Date(inv.created_at) >= monthStart
  ).length;

  const paidInvoices = invoices.filter((inv) => inv.status === "paid");
  const pendingInvoices = invoices.filter((inv) => inv.status === "sent");
  const overdueInvoices = invoices.filter((inv) => inv.status === "overdue");

  const totalRevenue = paidInvoices.reduce(
    (sum, inv) => sum + invoicePaidBaseAmount(inv),
    0
  );
  const pendingAmount = pendingInvoices.reduce(
    (sum, inv) => sum + invoiceBaseAmount(inv),
    0
  );
  const overdueAmount = overdueInvoices.reduce(
    (sum, inv) => sum + invoiceBaseAmount(inv),
    0
  );

  const planName = profile?.plan === "business" ? "Business" : profile?.plan === "pro" || profile?.is_pro ? "Pro" : "Free";
  const isPro = planName !== "Free";
  const invoiceBalance = Number(profile?.credits ?? 0);
  const freeRemaining = Math.max(0, FREE_PLAN_LIMIT - invoicesThisMonth);
  // Business rule: 1 invoice balance = 1 extra invoice after free monthly limit.
  // Keep DB column `credits` for compatibility, but show it to users as invoices.
  const remaining = isPro ? Number.POSITIVE_INFINITY : freeRemaining + invoiceBalance;

  // Get upcoming due invoices (next 7 days)
  const upcomingDue = invoices
    .filter((inv) => {
      const dueDate = new Date(inv.due_date);
      const diffDays = Math.ceil(
        (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      return diffDays >= 0 && diffDays <= 7 && inv.status !== "paid";
    })
    .slice(0, 5);

  // Plan badge
  const planBadgeColor = planName === "Business"
    ? "bg-gradient-to-r from-amber-300 to-yellow-400 text-amber-950"
    : isPro
    ? "bg-gradient-to-r from-primary-600 to-primary-700 text-white"
    : "bg-slate-100 text-slate-600";

  return (
    <div className="max-w-[1500px] mx-auto space-y-7 animate-fade-in pb-10">
      {/* Premium hero */}
      <section className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 px-6 py-7 text-white shadow-[0_28px_80px_-30px_rgba(79,70,229,.65)] sm:px-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-violet-500/25 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/3 h-32 w-72 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
        <div className="flex items-center gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
                {workspaceRole === "owner" ? `Welcome back${profile?.business_name ? `, ${profile.business_name}` : ""}` : workspaceName || profile?.business_name || "Workspace"}
              </h1>
              {workspaceRole === "owner" ? <Link
  to="/billing"
  className={`px-3 py-1 rounded-full text-xs font-semibold hover:scale-105 transition ${planBadgeColor}`}
>
  {planName}
</Link> : <span className={`px-3 py-1 rounded-full text-xs font-semibold ${planBadgeColor}`}>{planName}</span>}
            </div>
            <p className="mt-2 max-w-xl text-sm text-indigo-100 sm:text-base">
              A live view of revenue, invoices, clients and the work that needs your attention.
            </p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-3">
          <Link
            to="/new"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-bold text-violet-700 shadow-lg shadow-black/10 transition hover:-translate-y-0.5 hover:bg-violet-50"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4v16m8-8H4"
              />
            </svg>
            New Invoice
          </Link>
          <Link to="/clients" className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 py-3 font-semibold text-white backdrop-blur transition hover:bg-white/20">
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
              />
            </svg>
            Add Client
          </Link>
         {workspaceRole === "owner" && <Link
  to="/billing"
  className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 py-3 font-semibold text-white backdrop-blur transition hover:bg-white/20"
>
  <svg
    className="w-5 h-5"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
    />
  </svg>

  Billing
</Link>}
        </div>
      </div>
      </section>

      {/* Analytics Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Total Revenue"
         value={formatMoney(totalRevenue, profile?.currency ?? "USD")}
          icon={
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"
              />
            </svg>
          }
          color="green"
          loading={loading}
        />
        <StatCard
          label="Invoices This Month"
          value={String(invoicesThisMonth)}
          icon={
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          }
          color="primary"
          loading={loading}
        />
        <StatCard
          label="Paid Invoices"
          value={String(paidInvoices.length)}
          icon={
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
          color="green"
          loading={loading}
        />
        <StatCard
          label="Pending Payments"
          value={formatMoney(pendingAmount, profile?.currency ?? "USD")}
          icon={
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
          color="amber"
          loading={loading}
        />
        <StatCard
          label="Total Clients"
          value={String(clients.length)}
          icon={
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-5.13a4 4 0 11-8 0 4 4 0 018 0zm6 0a4 4 0 11-8 0 4 4 0 018 0z"
              />
            </svg>
          }
          color="blue"
          loading={loading}
        />
      </div>

      {/* Revenue Chart */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => setChartPeriod("7d")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              chartPeriod === "7d"
                ? "bg-primary-600 text-white"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            Last 7 Days
          </button>
          <button
            onClick={() => setChartPeriod("30d")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              chartPeriod === "30d"
                ? "bg-primary-600 text-white"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            Last 30 Days
          </button>
          <button
            onClick={() => setChartPeriod("year")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              chartPeriod === "year"
                ? "bg-primary-600 text-white"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            This Year
          </button>
        </div>
        <RevenueChart
  period={chartPeriod}
  currency={profile?.currency ?? "USD"}
  invoices={invoices}
/>
      </div>

      {/* Two Column Layout */}
      <div className="grid gap-6 xl:grid-cols-3">
        {/* Activity Feed */}
        <div className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_24px_70px_-38px_rgba(30,41,59,.45)] lg:col-span-2">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-600 via-indigo-500 to-cyan-400" />
          <div className="flex items-center justify-between border-b border-slate-100 p-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-500">Live workspace</p>
              <h2 className="mt-1 text-xl font-bold text-slate-950">Recent invoice activity</h2>
              <p className="text-sm text-slate-500">Latest updates across your billing workflow</p>
            </div>
            <Link to="/invoices" className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700">View all</Link>
          </div>
          <div className="p-4">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-start gap-3 py-2">
                    <Skeleton className="w-9 h-9 rounded-lg flex-shrink-0" />
                    <div className="flex-1">
                      <Skeleton className="h-4 w-40 mb-2" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-3 w-12" />
                  </div>
                ))}
              </div>
            ) : invoices.length === 0 ? (
              <div className="py-12 text-center">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <svg
                    className="w-8 h-8 text-slate-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <h3 className="text-base font-semibold text-slate-900 mb-1">
                  No invoices yet
                </h3>
                <p className="text-sm text-slate-500 mb-4">
                  Create your first invoice to get started
                </p>
                <button
                  onClick={() => navigate("/new")}
                  className="btn-primary"
                >
                  Create Invoice
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {invoices.slice(0, 6).map((inv) => (
                  <ActivityItem
                    key={inv.id}
                    type={inv.status === "paid" ? "payment" : inv.status === "overdue" ? "overdue" : "invoice"}
                    title={`${inv.invoice_number} ${inv.status === "paid" ? "paid" : "created"}`}
                    description={`${inv.client_name} • ${formatMoney(
  invoiceBaseAmount(inv),
  profile?.currency ?? "USD"
)}`}
                    timestamp={formatDate(inv.created_at)}
                    icon={
                      inv.status === "paid" ? (
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      ) : inv.status === "overdue" ? (
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                          />
                        </svg>
                      ) : (
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                      )
                    }
                  />
                ))}
              </div>
            )}
            {invoices.length > 6 && (
              <div className="pt-4 border-t border-slate-100">
                <Link
                  to="/invoices"
                  className="text-sm font-medium text-primary-600 hover:text-primary-700"
                >
                  View all invoices →
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Upcoming Due Invoices */}
        <div className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-gradient-to-b from-white to-amber-50/25 shadow-[0_24px_70px_-38px_rgba(30,41,59,.45)]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400" />
          <div className="border-b border-slate-100 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-600">Cash flow watch</p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">Upcoming payments</h2>
            <p className="text-sm text-slate-500">Invoices due within the next 7 days</p>
          </div>
          <div className="p-4">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="p-3 rounded-lg border border-slate-200">
                    <Skeleton className="h-4 w-24 mb-2" />
                    <Skeleton className="h-3 w-32 mb-2" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
            ) : upcomingDue.length === 0 ? (
              <div className="py-8 text-center">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg
                    className="w-6 h-6 text-green-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <p className="text-sm text-slate-600 font-medium">
                  All caught up!
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  No invoices due soon
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingDue.map((inv) => {
                  const dueDate = new Date(inv.due_date);
                  const diffDays = Math.ceil(
                    (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
                  );
                  const isUrgent = diffDays <= 2;

                  return (
                    <Link
                      key={inv.id}
                      to={`/invoice/${inv.id}`}
                      className="group block rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-violet-200 hover:bg-violet-50/40 hover:shadow-md"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-slate-900 text-sm">
                          {inv.invoice_number}
                        </span>
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            isUrgent
                              ? "bg-red-100 text-red-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {diffDays === 0
                            ? "Today"
                            : diffDays === 1
                            ? "Tomorrow"
                            : `${diffDays} days`}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 truncate">
                        {inv.client_name}
                      </p>
                      <p className="text-sm font-semibold text-slate-900 mt-1">
                        {formatMoney(
  Number(inv.invoice_total ?? inv.total),
  inv.invoice_currency ?? profile?.currency ?? "INR"
)}
                      </p>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions Panel */}
      <section className="relative overflow-hidden rounded-[30px] border border-slate-200/80 bg-gradient-to-br from-white via-white to-violet-50/60 p-6 shadow-[0_24px_70px_-40px_rgba(79,70,229,.5)] backdrop-blur">
        <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-violet-200/35 blur-3xl" />
        <div className="mb-5 flex items-end justify-between">
          <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-500">Move faster</p><h2 className="mt-1 text-xl font-bold text-slate-950">Quick Actions</h2></div>
          <span className="text-sm text-slate-400">Common workflows</span>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <QuickActionCard
            title="Create Invoice"
            description="Generate a new professional invoice"
            icon={
              <svg
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4v16m8-8H4"
                />
              </svg>
            }
            to="/new"
          />
          <QuickActionCard
            title="Manage Clients"
            description="Add or edit client information"
            icon={
              <svg
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-5.13a4 4 0 11-8 0 4 4 0 018 0zm6 0a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
            }
            to="/clients"
          />
          <QuickActionCard
            title="Business Settings"
            description="Update your business details"
            icon={
              <svg
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            }
            to="/settings"
          />
          <QuickActionCard
            title="Billing"
            description="Manage subscription & payments"
            icon={
              <svg
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                />
              </svg>
            }
            to="/billing"
          />
          <QuickActionCard
            title="Download Reports"
            description="Export invoice summaries"
            icon={
              <svg
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            }
            comingSoon
          />
        </div>
      </section>

      {/* Free Plan Banner */}
      {!isPro && (
        <div className="rounded-2xl bg-gradient-to-r from-primary-600 via-primary-700 to-primary-800 p-6 sm:p-8 text-white overflow-hidden relative">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRjMC0yIDIuMjAzLTMgNC0zczQgMSA0IDMtMiAyLTQgMi00LTIgLTQtNG0wLTMwYzAtMiAyLjIwMy0zIDQtM3M0IDEgNCAzLTIgMi00IDItNC0yLTQtNG0zMCAzMGMwLTIgMi4yMDMtMyA0LTNzNCAxIDQgMy0yIDItNCAyLTQtMi00LTRtLTMwIDMwYzAtMiAyLjIwMy0zIDQtM3M0IDEgNCAzLTIgMi00IDItNC0yLTQtNG0wLTYwYzAtMiAyLjIwMy0zIDQtM3M0IDEgNCAzLTIgMi00IDItNC0yLTQtNG0zMCAwYzAtMiAyLjIwMy0zIDQtM3M0IDEgNCAzLTIgMi00IDItNC0yLTQtNG0zMCA2MGMwLTIgMi4yMDMtMyA0LTNzNCAxIDQgMy0yIDItNCAyLTQtMi00LTRtLTMwIDMwYzAtMiAyLjIwMy0zIDQtM3M0IDEgNCAzLTIgMi00IDItNC0yLTQtNG0zMCAzMGMwLTIgMi4yMDMtMyA0LTNzNCAxIDQgMy0yIDItNCAyLTQtMi00LTRtMC02MGMwLTIgMi4yMDMtMyA0LTNzNCAxIDQgMy0yIDItNCAyLTQtMi00LTRtLTMwIDMwYzAtMiAyLjIwMy0zIDQtM3M0IDEgNCAzLTIgMi00IDItNC0yLTQtNG0zMCAwYzAtMiAyLjIwMy0zIDQtM3M0IDEgNCAzLTIgMi00IDItNC0yLTQtNG0wIDYwYzAtMiAyLjIwMy0zIDQtM3M0IDEgNCAzLTIgMi00IDItNC0yLTQtNG0zMCAzMGMwLTIgMi4yMDMtMyA0LTNzNCAxIDQgMy0yIDItNCAyLTQtMi00LTRtMC02MGMwLTIgMi4yMDMtMyA0LTNzNCAxIDQgMy0yIDItNCAyLTQtMi00LTRtLTMwIDMwYzAtMiAyLjIwMy0zIDQtM3M0IDEgNCAzLTIgMi00IDItNC0yLTQtNG0zMCAwYzAtMiAyLjIwMy0zIDQtM3M0IDEgNCAzLTIgMi00IDItNC0yLTQtNG0wIDYwYzAtMiAyLjIwMy0zIDQtM3M0IDEgNCAzLTIgMi00IDItNC0yLTQtNG0zMCAzMGMwLTIgMi4yMDMtMyA0LTNzNCAxIDQgMy0yIDItNCAyLTQtMi00LTRtMC02MGMwLTIgMi4yMDMtMyA0LTNzNCAxIDQgMy0yIDItNCAyLTQtMi00LTEiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-20" />
          <div className="relative flex flex-col sm:flex-row items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs uppercase tracking-wider font-medium text-primary-200">
                  Free Plan
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold mb-2">
                {remaining} invoice{remaining !== 1 ? "s" : ""} remaining
              </h3>
              <p className="text-primary-100 text-sm sm:text-base">
                Includes your monthly free invoices and any extra invoice balance added by admin.
              </p>
            </div>
            <Link
              to="/billing"
              className="bg-white text-primary-700 font-semibold rounded-xl px-6 py-3 hover:bg-primary-50 transition-all active:scale-[0.98] whitespace-nowrap shadow-lg hover:shadow-xl"
            >
              Upgrade to Pro
            </Link>
          </div>
        </div>
      )}

      {/* Overdue Alert */}
      {overdueInvoices.length > 0 && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-5">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg
                className="w-5 h-5 text-red-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-red-900">
                {overdueInvoices.length} overdue invoice{overdueInvoices.length > 1 ? "s" : ""}
              </h3>
              <p className="text-sm text-red-700 mt-0.5">
                Total overdue amount: {formatMoney(
  overdueAmount,
  profile?.currency ?? "USD"
)}
              </p>
            </div>
            <Link
              to="/invoices"
              className="text-sm font-medium text-red-700 hover:text-red-800 underline whitespace-nowrap"
            >
              View all
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
