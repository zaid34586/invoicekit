import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import type { Invoice, Client } from "../lib/types";
import { formatINR, formatDate, FREE_PLAN_LIMIT } from "../lib/constants";

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
    <div className="card p-5 hover:shadow-md transition-shadow duration-300 group">
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
    <div className="card p-5 hover:shadow-md hover:border-slate-300 transition-all duration-300 group cursor-pointer relative overflow-hidden">
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

// Revenue chart placeholder
function RevenueChart({ period }: { period: "7d" | "30d" | "year" }) {
  // Placeholder data based on period
  const chartData = {
    "7d": [3200, 4100, 2800, 5600, 4300, 3800, 5200],
    "30d": [
      2100, 3200, 2800, 4100, 3600, 2900, 4300, 3800, 5100, 4600, 3200, 5800,
      4200, 3900, 4800, 5500, 4100, 3700, 6200, 4900, 4300, 5100, 4700, 3800,
      5400, 4200, 6100, 5300, 4400, 5900,
    ],
    "year": [42000, 38000, 51000, 46000, 52000, 48000, 55000, 49000, 58000, 53000, 61000, 57000],
  };

  const data = chartData[period];
  const maxValue = Math.max(...data);
  const total = data.reduce((a, b) => a + b, 0);

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            Revenue Overview
          </h3>
          <p className="text-sm text-slate-500 mt-0.5">
            Total: {formatINR(total)}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="flex items-center gap-1 text-green-600 font-medium">
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 10l7-7m0 0l7 7m-7-7v18"
              />
            </svg>
            12.5%
          </span>
          <span className="text-slate-500">vs last period</span>
        </div>
      </div>

      {/* Simple bar chart */}
      <div className="flex items-end gap-1.5 h-40">
        {data.slice(-10).map((value, i) => (
          <div
            key={i}
            className="flex-1 bg-gradient-to-t from-primary-500 to-primary-400 rounded-t transition-all duration-500 hover:from-primary-600 hover:to-primary-500 group relative"
            style={{ height: `${(value / maxValue) * 100}%` }}
          >
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
              {formatINR(value)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartPeriod, setChartPeriod] = useState<"7d" | "30d" | "year">("30d");

  useEffect(() => {
    async function load() {
      const [invoiceRes, clientRes] = await Promise.all([
        supabase
          .from("invoices")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(20),
        supabase.from("clients").select("*").order("created_at", { ascending: false }),
      ]);

      if (invoiceRes.data) setInvoices(invoiceRes.data as Invoice[]);
      if (clientRes.data) setClients(clientRes.data as Client[]);
      setLoading(false);
    }
    load();
  }, []);

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
    (sum, inv) => sum + Number(inv.total),
    0
  );
  const pendingAmount = pendingInvoices.reduce(
    (sum, inv) => sum + Number(inv.total),
    0
  );
  const overdueAmount = overdueInvoices.reduce(
    (sum, inv) => sum + Number(inv.total),
    0
  );

  const isPro = profile?.is_pro ?? false;
  const remaining = Math.max(0, FREE_PLAN_LIMIT - invoicesThisMonth);

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
  const planName = isPro ? "Pro" : "Free";
  const planBadgeColor = isPro
    ? "bg-gradient-to-r from-primary-600 to-primary-700 text-white"
    : "bg-slate-100 text-slate-600";

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-fade-in pb-8">
      {/* Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-slate-900">
                Welcome back{profile?.business_name ? `, ${profile.business_name}` : ""}
              </h1>
              <span
                className={`px-3 py-1 rounded-full text-xs font-semibold ${planBadgeColor}`}
              >
                {planName}
              </span>
            </div>
            <p className="text-slate-500">
              Here's what's happening with your business today.
            </p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-3">
          <Link
            to="/new"
            className="btn-primary px-5 py-2.5"
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
          <Link to="/clients" className="btn-secondary px-5 py-2.5">
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
          <Link to="/billing" className="btn-ghost px-4 py-2.5">
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
          </Link>
        </div>
      </div>

      {/* Analytics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="Total Revenue"
          value={formatINR(totalRevenue)}
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
          trend="up"
          trendValue="12.5%"
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
          trend="up"
          trendValue="8%"
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
          trend="up"
          trendValue="15%"
          color="green"
          loading={loading}
        />
        <StatCard
          label="Pending Payments"
          value={formatINR(pendingAmount)}
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
          trend="neutral"
          trendValue="Same"
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
          trend="up"
          trendValue="3 new"
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
        <RevenueChart period={chartPeriod} />
      </div>

      {/* Two Column Layout */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Activity Feed */}
        <div className="lg:col-span-2 card">
          <div className="p-5 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-slate-900">
              Invoice Activity
            </h2>
            <p className="text-sm text-slate-500">Recent invoice actions</p>
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
                    description={`${inv.client_name} • ${formatINR(Number(inv.total))}`}
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
        <div className="card">
          <div className="p-5 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-slate-900">
              Upcoming Due
            </h2>
            <p className="text-sm text-slate-500">Due within next 7 days</p>
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
                      className="block p-3 rounded-lg border border-slate-200 hover:border-primary-300 hover:bg-primary-50/30 transition-all group"
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
                        {formatINR(Number(inv.total))}
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
      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          Quick Actions
        </h2>
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
      </div>

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
                {remaining} invoice{remaining !== 1 ? "s" : ""} remaining this month
              </h3>
              <p className="text-primary-100 text-sm sm:text-base">
                Upgrade to Pro for unlimited invoices, client management, and premium features.
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
                Total overdue amount: {formatINR(overdueAmount)}
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
