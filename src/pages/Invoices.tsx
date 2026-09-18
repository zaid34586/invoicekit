import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import type { Invoice, InvoiceStatus } from "../lib/types";
import { formatDate } from "../lib/constants";
import { formatMoney } from "../lib/currency";
import StatusBadge from "../components/StatusBadge";
import Skeleton from "../components/Skeleton";
import AdBanner from "../components/AdBanner";

type Filter = "all" | InvoiceStatus;

// List rows only need these scalar columns — the heavy `items` JSON (line
// items, tax snapshot) is only fetched when a single invoice is opened, so
// a business with thousands of invoices doesn't download every line item
// just to render a table. Keeps the list fast as data grows.
const LIST_COLUMNS =
  "id, invoice_number, client_name, status, created_at, invoice_total, total, invoice_currency, business_currency, is_recurring, recurring_frequency, recurring_next_date, recurring_count";

// Render window — rows are fetched trimmed, then paginated client-side so
// the DOM never renders thousands of <tr> at once.
const PAGE_SIZE = 25;

export default function Invoices() {
  const { user, profile, workspaceOwnerId, workspaceRole } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!user) return;
      const { data, error } = await supabase
        .from("invoices")
        .select(LIST_COLUMNS)
        .eq("user_id", workspaceOwnerId || user.id)
        .order("created_at", { ascending: false });
      if (!error && data) {
        setInvoices(data as Invoice[]);
      }
      setLoading(false);
    }
    load();
  }, [user, workspaceOwnerId]);

  async function cancelRecurring(invoiceId: string) {
    setCancellingId(invoiceId);
    const { error } = await supabase
      .from("invoices")
      .update({
        is_recurring: false,
        recurring_frequency: null,
        recurring_next_date: null,
        recurring_end_date: null,
      })
      .eq("id", invoiceId)
      .eq("user_id", workspaceOwnerId || user?.id);

    if (!error) {
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoiceId
            ? { ...inv, is_recurring: false, recurring_frequency: null, recurring_next_date: null }
            : inv
        )
      );
    }
    setCancellingId(null);
  }

  const filtered = invoices.filter((inv) => {
    if (filter !== "all" && inv.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        inv.invoice_number.toLowerCase().includes(q) ||
        inv.client_name.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Reset the render window whenever the filter/search changes so a new
  // search isn't stuck on an old "load more" offset.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filter, search]);

  const visible = filtered.slice(0, visibleCount);

  const counts = {
    all: invoices.length,
    draft: invoices.filter((i) => i.status === "draft").length,
    sent: invoices.filter((i) => i.status === "sent").length,
    paid: invoices.filter((i) => i.status === "paid").length,
    overdue: invoices.filter((i) => i.status === "overdue").length,
  };

  const filterTabs: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "draft", label: "Draft" },
    { key: "sent", label: "Sent" },
    { key: "paid", label: "Paid" },
    { key: "overdue", label: "Overdue" },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
      {!profile?.is_pro && profile?.plan !== "pro" && profile?.plan !== "business" && <AdBanner />}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">All Invoices</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {invoices.length} invoice{invoices.length !== 1 ? "s" : ""} total
          </p>
        </div>
        {workspaceRole !== "accountant" && <Link to="/new" className="btn-primary">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Invoice
        </Link>}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 bg-white rounded-lg border border-slate-200 p-1 overflow-x-auto">
          {filterTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition whitespace-nowrap ${
                filter === tab.key
                  ? "bg-primary-600 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {tab.label}
              <span className="ml-1.5 text-xs opacity-70">
                {counts[tab.key]}
              </span>
            </button>
          ))}
        </div>
        <div className="flex-1 relative">
          <svg
            className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9"
            placeholder="Search by invoice number or client..."
          />
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="space-y-3 p-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-1">
              {invoices.length === 0 ? "No invoices yet" : "No matching invoices"}
            </h3>
            <p className="text-sm text-slate-500 mb-5">
              {invoices.length === 0
                ? "Create your first invoice to get started"
                : "Try a different filter or search"}
            </p>
            {invoices.length === 0 && workspaceRole !== "accountant" && (
              <Link to="/new" className="btn-primary">
                Create your first invoice
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-3">
                    Invoice #
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-3">
                    Client
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-3 hidden sm:table-cell">
                    Amount
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-3 hidden md:table-cell">
                    Date
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-3">
                    Status
                  </th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-3">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/50 transition">
                    <td className="px-5 py-3.5">
                      <Link
                        to={`/invoice/${inv.id}`}
                        className="font-medium text-primary-600 hover:underline"
                      >
                        {inv.invoice_number}
                      </Link>
                      {(inv as any).is_recurring && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-600 border border-indigo-100">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          {(inv as any).recurring_frequency || "Recurring"}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate-700">
                      {inv.client_name}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate-700 hidden sm:table-cell">
                      {formatMoney(
                        Number(inv.invoice_total ?? inv.total),
                        inv.invoice_currency ?? inv.business_currency ?? "INR"
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate-500 hidden md:table-cell">
                      {formatDate(inv.created_at)}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={inv.status} />
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-3 whitespace-nowrap">
                        <Link
                          to={`/invoice/${inv.id}`}
                          className="text-sm text-primary-600 font-medium hover:underline"
                        >
                          View
                        </Link>
                        <Link
                          to={`/new?edit=${inv.id}`}
                          className="text-sm text-slate-600 font-medium hover:underline"
                        >
                          Edit
                        </Link>
                        {(inv as any).is_recurring && (
                          <button
                            onClick={() => cancelRecurring(inv.id)}
                            disabled={cancellingId === inv.id}
                            className="text-sm text-red-500 font-medium hover:underline disabled:opacity-50"
                          >
                            {cancellingId === inv.id ? "Stopping..." : "Stop"}
                          </button>
                        )}
                        <Link
                          to={`/new?duplicate=${inv.id}`}
                          className="text-sm text-violet-600 font-medium hover:underline"
                        >
                          Duplicate
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length > visibleCount && (
              <div className="border-t border-slate-100 p-4 text-center">
                <button
                  onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                  className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                >
                  Load more ({filtered.length - visibleCount} remaining)
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
