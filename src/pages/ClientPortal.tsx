import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { formatMoney } from "../lib/currency";
import { formatDate } from "../lib/constants";
import StatusBadge from "../components/StatusBadge";

interface PortalClient {
  id: string;
  user_id: string;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  gstin: string | null;
  country: string | null;
}

interface PortalInvoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  status: string;
  invoice_total: number | null;
  total: number;
  invoice_currency: string | null;
  share_token: string | null;
  items: any[];
  notes: string | null;
  created_at: string;
}

export default function ClientPortal() {
  const { clientToken } = useParams<{ clientToken: string }>();
  const [client, setClient] = useState<PortalClient | null>(null);
  const [invoices, setInvoices] = useState<PortalInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<PortalInvoice | null>(null);
  const [activeTab, setActiveTab] = useState<"invoices" | "profile">("invoices");

  useEffect(() => {
    async function loadPortal() {
      if (!clientToken) {
        setError("Invalid portal link");
        setLoading(false);
        return;
      }

      // Look up client by portal_token
      const { data: clientData, error: clientError } = await supabase
        .from("clients")
        .select("id, user_id, name, email, phone, address, gstin, country")
        .eq("portal_token", clientToken)
        .single();

      if (clientError || !clientData) {
        setError("Invalid or expired portal link. Please request a new one from your business.");
        setLoading(false);
        return;
      }

      setClient(clientData as PortalClient);

      // Load client's invoices — query by the business owner's user_id + client name
      const { data: invoiceData } = await supabase
        .from("invoices")
        .select("id, invoice_number, invoice_date, due_date, status, invoice_total, total, invoice_currency, share_token, items, notes, created_at")
        .eq("user_id", clientData.user_id)
        .eq("client_name", clientData.name)
        .order("created_at", { ascending: false });

      if (invoiceData) {
        setInvoices(invoiceData as PortalInvoice[]);
      }

      setLoading(false);
    }

    loadPortal();
  }, [clientToken]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/30 to-violet-50/20 flex items-center justify-center">
        <div className="text-center">
          <div className="h-12 w-12 rounded-full bg-indigo-100 flex items-center justify-center mx-auto mb-4 animate-pulse">
            <span className="text-2xl">⏳</span>
          </div>
          <p className="text-slate-600">Loading your portal...</p>
        </div>
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/30 to-violet-50/20 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🔒</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h1>
          <p className="text-slate-600 mb-6">{error || "Invalid portal link"}</p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white hover:bg-indigo-700 transition"
          >
            Go to Homepage
          </Link>
        </div>
      </div>
    );
  }

  const totalPending = invoices
    .filter((inv) => inv.status === "sent" || inv.status === "overdue")
    .reduce((sum, inv) => sum + Number(inv.invoice_total ?? inv.total), 0);

  const totalPaid = invoices
    .filter((inv) => inv.status === "paid")
    .reduce((sum, inv) => sum + Number(inv.invoice_total ?? inv.total), 0);

  const primaryCurrency = invoices[0]?.invoice_currency ?? (client.country === "India" ? "INR" : "USD");

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/30 to-violet-50/20">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/60 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg">
              {client.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">{client.name}</h1>
              <p className="text-xs text-slate-500">Client Portal</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">Logged in as</p>
            <p className="text-sm font-medium text-slate-700">{client.email}</p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-100">
            <p className="text-sm text-slate-500">Total Invoices</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{invoices.length}</p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-100">
            <p className="text-sm text-slate-500">Pending</p>
            <p className="text-2xl font-bold text-amber-600 mt-1">
              {formatMoney(totalPending, primaryCurrency)}
            </p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-100">
            <p className="text-sm text-slate-500">Paid</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">
              {formatMoney(totalPaid, primaryCurrency)}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-xl bg-white p-1 shadow-sm border border-slate-100 w-fit">
          <button
            onClick={() => setActiveTab("invoices")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
              activeTab === "invoices"
                ? "bg-indigo-600 text-white"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            My Invoices
          </button>
          <button
            onClick={() => setActiveTab("profile")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
              activeTab === "profile"
                ? "bg-indigo-600 text-white"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            My Profile
          </button>
        </div>

        {/* Invoices Tab */}
        {activeTab === "invoices" && (
          <div className="space-y-4">
            {invoices.length === 0 ? (
              <div className="rounded-2xl bg-white p-12 text-center shadow-sm border border-slate-100">
                <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl">📄</span>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">No Invoices Yet</h3>
                <p className="text-slate-500">Your invoices will appear here once they're created.</p>
              </div>
            ) : (
              <div className="rounded-2xl bg-white shadow-sm border border-slate-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/50">
                        <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Invoice</th>
                        <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase hidden sm:table-cell">Date</th>
                        <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase hidden sm:table-cell">Due Date</th>
                        <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Amount</th>
                        <th className="px-5 py-3 text-center text-xs font-semibold text-slate-500 uppercase">Status</th>
                        <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {invoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-slate-50/50 transition">
                          <td className="px-5 py-3.5">
                            <button
                              onClick={() => setSelectedInvoice(selectedInvoice?.id === inv.id ? null : inv)}
                              className="font-medium text-indigo-600 hover:underline text-left"
                            >
                              {inv.invoice_number}
                            </button>
                          </td>
                          <td className="px-5 py-3.5 text-sm text-slate-600 hidden sm:table-cell">
                            {formatDate(inv.invoice_date)}
                          </td>
                          <td className="px-5 py-3.5 text-sm text-slate-600 hidden sm:table-cell">
                            {formatDate(inv.due_date)}
                          </td>
                          <td className="px-5 py-3.5 text-right font-semibold text-slate-900">
                            {formatMoney(
                              Number(inv.invoice_total ?? inv.total),
                              inv.invoice_currency ?? "USD"
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <StatusBadge status={inv.status as any} />
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {inv.share_token && (
                                <a
                                  href={`/share/${inv.share_token}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-slate-500 hover:text-indigo-600 hover:underline"
                                >
                                  View PDF
                                </a>
                              )}
                              {(inv.status === "sent" || inv.status === "overdue") && (
                                <button className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition">
                                  Pay Now
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Invoice Detail Modal */}
            {selectedInvoice && (
              <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-100">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-slate-900">{selectedInvoice.invoice_number}</h3>
                  <button
                    onClick={() => setSelectedInvoice(null)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                  <div>
                    <p className="text-slate-500">Invoice Date</p>
                    <p className="font-medium text-slate-900">{formatDate(selectedInvoice.invoice_date)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Due Date</p>
                    <p className="font-medium text-slate-900">{formatDate(selectedInvoice.due_date)}</p>
                  </div>
                </div>

                {/* Line Items */}
                <div className="mb-4">
                  <h4 className="text-sm font-semibold text-slate-700 mb-2">Items</h4>
                  <div className="rounded-lg bg-slate-50 p-3 space-y-2">
                    {(selectedInvoice.items || []).map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between text-sm">
                        <span className="text-slate-700">{item.description}</span>
                        <span className="font-medium text-slate-900">
                          {formatMoney(item.qty * item.rate, selectedInvoice.invoice_currency ?? "USD")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {selectedInvoice.notes && (
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-slate-700 mb-1">Notes</h4>
                    <p className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3">{selectedInvoice.notes}</p>
                  </div>
                )}

                <div className="flex justify-between items-center pt-4 border-t border-slate-200">
                  <span className="text-lg font-bold text-slate-900">Total</span>
                  <span className="text-xl font-bold text-indigo-600">
                    {formatMoney(
                      Number(selectedInvoice.invoice_total ?? selectedInvoice.total),
                      selectedInvoice.invoice_currency ?? "USD"
                    )}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Profile Tab */}
        {activeTab === "profile" && (
          <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-100">
            <h3 className="text-lg font-bold text-slate-900 mb-4">My Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-slate-500">Name</label>
                <p className="text-sm font-medium text-slate-900 mt-1">{client.name}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Email</label>
                <p className="text-sm font-medium text-slate-900 mt-1">{client.email}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Phone</label>
                <p className="text-sm font-medium text-slate-900 mt-1">{client.phone || "—"}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Country</label>
                <p className="text-sm font-medium text-slate-900 mt-1">{client.country || "—"}</p>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-slate-500">Address</label>
                <p className="text-sm font-medium text-slate-900 mt-1">{client.address || "—"}</p>
              </div>
              {client.gstin && (
                <div>
                  <label className="text-xs font-medium text-slate-500">Tax ID</label>
                  <p className="text-sm font-medium text-slate-900 mt-1">{client.gstin}</p>
                </div>
              )}
            </div>
            <div className="mt-6 pt-4 border-t border-slate-100">
              <p className="text-xs text-slate-500">
                To update your information, please contact your business directly.
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center py-6 text-xs text-slate-400">
        Powered by <span className="font-semibold text-indigo-600">Rivox</span>
      </footer>
    </div>
  );
}
