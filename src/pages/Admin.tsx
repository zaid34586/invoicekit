import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { ADMIN_EMAIL, formatDate } from "../lib/constants";
import { formatMoney } from "../lib/currency";
import type { Profile, Invoice } from "../lib/types";
import StatusBadge from "../components/StatusBadge";

export default function Admin() {
  const { user, loading } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  useEffect(() => {
    async function load() {
      if (!user || !isAdmin) {
        setDataLoading(false);
        return;
      }
      setError(null);
      try {
        const [profRes, invRes] = await Promise.all([
          supabase.from("profiles").select("*").order("created_at", { ascending: false }),
          supabase.from("invoices").select("*").order("created_at", { ascending: false }),
        ]);

        if (profRes.error) throw profRes.error;
        if (invRes.error) throw invRes.error;

        setProfiles((profRes.data as Profile[]) ?? []);
        setInvoices((invRes.data as Invoice[]) ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load admin data");
      }
      setDataLoading(false);
    }
    load();
  }, [user, isAdmin]);

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
        <div className="card p-8 text-center">
          <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-slate-900 mb-2">Access Denied</h1>
          <p className="text-sm text-slate-500 mb-4">
            You do not have permission to access the admin dashboard.
          </p>
          <p className="text-xs text-slate-400 mb-6">
            Admin access is restricted to {ADMIN_EMAIL}
          </p>
          <Link to="/" className="btn-primary">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const proUsers = profiles.filter((p) => p.is_pro).length;
  const freeUsers = profiles.length - proUsers;
  const totalRevenue = invoices
    .filter((i) => i.status === "paid")
    .reduce((sum, i) => sum + Number(i.total), 0);
  const paidInvoices = invoices.filter((i) => i.status === "paid").length;
  const overdueInvoices = invoices.filter((i) => i.status === "overdue").length;

  // NOTE: this sums `total` across every user's invoices without converting
  // currencies — fine while every business on the platform uses the same
  // base currency, but once businesses in different countries/currencies
  // exist, a raw sum here is misleading (adding USD + EUR + INR as if they
  // were the same unit). Flagged here rather than silently formatted with
  // one currency's symbol; a real fix needs per-currency subtotals or FX
  // conversion, which is out of scope for this pass.
  const stats = [
    { label: "Total Users", value: String(profiles.length), color: "text-primary-600 bg-primary-50" },
    { label: "Pro Users", value: String(proUsers), color: "text-amber-600 bg-amber-50" },
    { label: "Free Users", value: String(freeUsers), color: "text-slate-600 bg-slate-100" },
    { label: "Total Invoices", value: String(invoices.length), color: "text-blue-600 bg-blue-50" },
    { label: "Paid Invoices", value: String(paidInvoices), color: "text-green-600 bg-green-50" },
    { label: "Overdue", value: String(overdueInvoices), color: "text-red-600 bg-red-50" },
    { label: "Revenue (Paid, mixed currencies)", value: formatMoney(totalRevenue, "USD"), color: "text-green-600 bg-green-50" },
    { label: "Avg Invoice (mixed currencies)", value: formatMoney(invoices.length ? totalRevenue / Math.max(paidInvoices, 1) : 0, "USD"), color: "text-primary-600 bg-primary-50" },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Overview of users, plans, and invoices
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="card p-5">
            <span className={`inline-flex w-9 h-9 rounded-lg items-center justify-center text-xs font-bold mb-3 ${stat.color}`}>
              {stat.label[0]}
            </span>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              {stat.label}
            </p>
            <p className="text-xl font-bold text-slate-900 mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="p-5 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">Users & Plans</h2>
        </div>
        {dataLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading...</div>
        ) : profiles.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No users found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase px-5 py-3">Business</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase px-5 py-3 hidden sm:table-cell">GSTIN</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase px-5 py-3">Plan</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase px-5 py-3 hidden md:table-cell">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {profiles.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/50 transition">
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-slate-900">
                        {p.business_name || "Unnamed"}
                      </p>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate-600 hidden sm:table-cell">
                      {p.gstin || "—"}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium border ${
                          p.is_pro
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-slate-100 text-slate-600 border-slate-200"
                        }`}
                      >
                        {p.is_pro ? "Pro" : "Free"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate-500 hidden md:table-cell">
                      {formatDate(p.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="p-5 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">All Invoices</h2>
        </div>
        {dataLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading...</div>
        ) : invoices.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No invoices found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase px-5 py-3">Invoice #</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase px-5 py-3">Client</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase px-5 py-3 hidden sm:table-cell">Amount</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase px-5 py-3">Status</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase px-5 py-3 hidden md:table-cell">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/50 transition">
                    <td className="px-5 py-3.5 font-medium text-slate-900">
                      {inv.invoice_number}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate-700">
                      {inv.client_name}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate-700 hidden sm:table-cell">
                      {formatMoney(
                        inv.invoice_total ?? Number(inv.total),
                        inv.invoice_currency ?? inv.base_currency ?? "USD"
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={inv.status} />
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate-500 hidden md:table-cell">
                      {formatDate(inv.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card p-5">
        <h2 className="text-base font-semibold text-slate-900 mb-2">Payments</h2>
        <p className="text-sm text-slate-500">
          Payment gateway coming soon. Once integrated, payment records will appear here.
        </p>
      </div>
    </div>
  );
}
