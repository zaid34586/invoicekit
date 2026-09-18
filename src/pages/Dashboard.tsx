import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import type { Invoice, Client } from "../lib/types";
import { formatDate, FREE_PLAN_LIMIT } from "../lib/constants";
import { formatMoney } from "../lib/currency";
import { invoiceBaseAmount, invoicePaidBaseAmount, invoiceDate, startOfDay, endOfDay, isWithin } from "../lib/invoiceAnalytics";
import { cachedQuery } from "../lib/queryCache";
import AdBanner from "../components/AdBanner";

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

    // Dashboard only needs summary fields for analytics and recent list.
    // Full invoice data (line items, etc.) is loaded on the InvoicePreview page.
    // This dramatically reduces the initial payload from ~2MB to ~200KB.
    const cacheKey = `dash:${workspaceOwnerId || user.id}`;
    const [invoiceRows, clientRows] = await Promise.all([
      cachedQuery<Invoice[] | null>(cacheKey + ":invoices", 30_000, () =>
        supabase
          .from("invoices")
          .select("id,invoice_number,client_name,total,base_total,invoice_total,status,created_at,due_date,invoice_currency,exchange_rate,business_country,client_country,base_currency,refunded_amount,items")
          .eq("user_id", workspaceOwnerId || user.id)
          .order("created_at", { ascending: false })
          .limit(500)
          .then((r) => r.data as Invoice[] | null)
      ),
      cachedQuery<Client[] | null>(cacheKey + ":clients", 30_000, () =>
        supabase
          .from("clients")
          .select("id")
          .eq("user_id", workspaceOwnerId || user.id)
          .then((r) => r.data as Client[] | null)
      ),
    ]);

    if (invoiceRows) setInvoices(invoiceRows);
    if (clientRows) setClients(clientRows);

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
    <div className="max-w-[1500px] mx-auto space-y-6 animate-fade-in pb-10">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-slate-900 via-indigo-950 to-violet-900 px-6 py-6 sm:px-8 text-white shadow-[0_32px_80px_-30px_rgba(79,70,229,.7)]">
        {/* Animated orbs */}
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-violet-500/30 blur-[80px] animate-pulse" />
        <div className="pointer-events-none absolute -left-16 bottom-0 h-48 w-48 rounded-full bg-cyan-400/15 blur-[60px] animate-pulse" style={{ animationDelay: "1s" }} />
        <div className="pointer-events-none absolute right-1/3 top-1/2 h-32 w-32 rounded-full bg-fuchsia-400/10 blur-[50px] animate-pulse" style={{ animationDelay: "2s" }} />

        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
                {workspaceRole === "owner" ? `Welcome back${profile?.business_name ? `, ${profile.business_name}` : ""}` : workspaceName || profile?.business_name || "Workspace"}
              </h1>
              {workspaceRole === "owner" ? (
                <Link to="/billing" className={`px-3 py-1 rounded-full text-xs font-bold hover:scale-105 transition shadow-lg ${planBadgeColor}`}>
                  {planName}
                </Link>
              ) : (
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${planBadgeColor}`}>{planName}</span>
              )}
            </div>
            <p className="max-w-lg text-sm text-indigo-200/80 sm:text-sm leading-relaxed">
              Your command center — revenue, invoices, clients, and action items at a glance.
            </p>

            {/* Quick stats row */}
            <div className="flex flex-wrap items-center gap-4 mt-4">
              <div className="flex items-center gap-2 rounded-xl bg-white/10 backdrop-blur-sm px-4 py-2 border border-white/10">
                <span className="text-lg">💰</span>
                <div>
                  <p className="text-[10px] text-indigo-200/60 uppercase font-medium">Revenue</p>
                  <p className="text-sm font-bold">{formatMoney(totalRevenue, profile?.currency ?? "USD")}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-white/10 backdrop-blur-sm px-4 py-2 border border-white/10">
                <span className="text-lg">📄</span>
                <div>
                  <p className="text-[10px] text-indigo-200/60 uppercase font-medium">Invoices</p>
                  <p className="text-sm font-bold">{invoicesThisMonth} this month</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-white/10 backdrop-blur-sm px-4 py-2 border border-white/10">
                <span className="text-lg">👥</span>
                <div>
                  <p className="text-[10px] text-indigo-200/60 uppercase font-medium">Clients</p>
                  <p className="text-sm font-bold">{clients.length}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Hero Actions */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 lg:flex-shrink-0">
            <Link
              to="/new"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 font-bold text-indigo-700 shadow-xl shadow-black/10 transition hover:-translate-y-0.5 hover:bg-indigo-50"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New Invoice
            </Link>
            <Link to="/clients" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-6 py-3 font-semibold text-white backdrop-blur transition hover:bg-white/20">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              Add Client
            </Link>
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
      <section className="relative overflow-hidden rounded-[24px] border border-slate-200/80 bg-white p-6 shadow-[0_8px_30px_-12px_rgba(79,70,229,.25)]">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Quick Actions</h2>
            <p className="text-sm text-slate-500 mt-0.5">Common workflows</p>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Link to="/new" className="group flex items-center gap-4 rounded-2xl border border-slate-100 bg-gradient-to-br from-indigo-50/80 to-violet-50/50 p-4 transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-100">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-indigo-200 group-hover:scale-110 transition-transform">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-slate-900 group-hover:text-indigo-700 transition-colors text-sm">New Invoice</h3>
              <p className="text-xs text-slate-500">Create & send</p>
            </div>
          </Link>

          <Link to="/clients" className="group flex items-center gap-4 rounded-2xl border border-slate-100 bg-gradient-to-br from-emerald-50/80 to-teal-50/50 p-4 transition-all hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-lg hover:shadow-emerald-100">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-lg shadow-emerald-200 group-hover:scale-110 transition-transform">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-5.13a4 4 0 11-8 0 4 4 0 018 0zm6 0a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-slate-900 group-hover:text-emerald-700 transition-colors text-sm">Clients</h3>
              <p className="text-xs text-slate-500">Manage contacts</p>
            </div>
          </Link>

          <Link to="/reports" className="group flex items-center gap-4 rounded-2xl border border-slate-100 bg-gradient-to-br from-amber-50/80 to-orange-50/50 p-4 transition-all hover:-translate-y-0.5 hover:border-amber-200 hover:shadow-lg hover:shadow-amber-100">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-lg shadow-amber-200 group-hover:scale-110 transition-transform">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-slate-900 group-hover:text-amber-700 transition-colors text-sm">Reports</h3>
              <p className="text-xs text-slate-500">Analytics & trends</p>
            </div>
          </Link>

          <Link to="/settings" className="group flex items-center gap-4 rounded-2xl border border-slate-100 bg-gradient-to-br from-slate-50 to-slate-100/50 p-4 transition-all hover:-translate-y-0.5 hover:border-slate-200 hover:shadow-lg hover:shadow-slate-100">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-white shadow-lg shadow-slate-200 group-hover:scale-110 transition-transform">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-slate-900 group-hover:text-slate-700 transition-colors text-sm">Settings</h3>
              <p className="text-xs text-slate-500">Business setup</p>
            </div>
          </Link>
        </div>
      </section>

      {/* Free Plan Banner */}
      {!isPro && (
        <div className="rounded-[24px] bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 p-5 sm:p-6 text-white overflow-hidden relative shadow-xl shadow-indigo-200">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-4 right-4 h-32 w-32 rounded-full bg-white blur-[60px]" />
            <div className="absolute bottom-4 left-4 h-24 w-24 rounded-full bg-white blur-[40px]" />
          </div>
          <div className="relative flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-3xl">
                🚀
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg sm:text-xl font-bold">Free Plan</h3>
                  <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase">Active</span>
                </div>
                <p className="text-indigo-100 text-sm mt-0.5">
                  {remaining} invoice{remaining !== 1 ? "s" : ""} remaining this month
                </p>
              </div>
            </div>
            <Link
              to="/billing"
              className="inline-flex items-center gap-2 bg-white text-indigo-700 font-bold rounded-xl px-6 py-3 hover:bg-indigo-50 transition-all active:scale-[0.98] whitespace-nowrap shadow-lg"
            >
              Upgrade to Pro
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </div>
        </div>
      )}

      {/* Ad Banner for Free Users */}
      {!isPro && <AdBanner />}

      {/* Overdue Alert */}
      {overdueInvoices.length > 0 && (
        <div className="rounded-[20px] bg-gradient-to-r from-red-50 to-rose-50 border border-red-200/80 p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
              <span className="text-2xl">⚠️</span>
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-red-900">
                {overdueInvoices.length} overdue invoice{overdueInvoices.length > 1 ? "s" : ""}
              </h3>
              <p className="text-sm text-red-600">
                Total: {formatMoney(overdueAmount, profile?.currency ?? "USD")}
              </p>
            </div>
            <Link
              to="/invoices"
              className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 transition shadow-sm"
            >
              View All
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
