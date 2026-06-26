import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import type { Client, Invoice } from "../lib/types";
import { INDIAN_STATES, formatINR, formatDate } from "../lib/constants";
import StatusBadge from "../components/StatusBadge";

const EMPTY_FORM = {
  name: "",
  phone: "",
  email: "",
  address: "",
  state: "",
  gstin: "",
};

export default function Clients() {
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyClient, setHistoryClient] = useState<Client | null>(null);
  const [historyInvoices, setHistoryInvoices] = useState<Invoice[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    async function load() {
      if (!user) return;
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("created_at", { ascending: false });
      if (!error && data) setClients(data as Client[]);
      setLoading(false);
    }
    load();
  }, [user]);

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setShowForm(true);
  }

  function openEdit(client: Client) {
    setEditingId(client.id);
    setForm({
      name: client.name,
      phone: client.phone ?? "",
      email: client.email ?? "",
      address: client.address ?? "",
      state: client.state ?? "",
      gstin: client.gstin ?? "",
    });
    setError(null);
    setShowForm(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);
    if (!form.name.trim()) {
      setError("Client name is required");
      return;
    }
    setSaving(true);
    const payload = {
      user_id: user.id,
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      state: form.state || null,
      gstin: form.gstin.trim().toUpperCase() || null,
    };

    if (editingId) {
      const { data, error } = await supabase
        .from("clients")
        .update(payload)
        .eq("id", editingId)
        .select("*")
        .single();
      setSaving(false);
      if (error) {
        setError(error.message);
        return;
      }
      setClients((prev) =>
        prev.map((c) => (c.id === editingId ? (data as Client) : c))
      );
    } else {
      const { data, error } = await supabase
        .from("clients")
        .insert(payload)
        .select("*")
        .single();
      setSaving(false);
      if (error) {
        setError(error.message);
        return;
      }
      setClients((prev) => [data as Client, ...prev]);
    }
    setShowForm(false);
  }

  async function handleDelete(client: Client) {
    if (!confirm(`Delete client "${client.name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("clients").delete().eq("id", client.id);
    if (!error) {
      setClients((prev) => prev.filter((c) => c.id !== client.id));
    }
  }

  async function showHistory(client: Client) {
    setHistoryClient(client);
    setHistoryInvoices([]);
    setHistoryLoading(true);
    const { data } = await supabase
      .from("invoices")
      .select("*")
      .eq("client_name", client.name)
      .order("created_at", { ascending: false });
    setHistoryInvoices((data as Invoice[]) ?? []);
    setHistoryLoading(false);
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {clients.length} client{clients.length !== 1 ? "s" : ""} saved
          </p>
        </div>
        <button onClick={openAdd} className="btn-primary">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Client
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="card p-5 sm:p-6 space-y-4">
          <h2 className="text-base font-semibold text-slate-900">
            {editingId ? "Edit Client" : "New Client"}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input"
                placeholder="Acme Corp"
              />
            </div>
            <div>
              <label className="label">GSTIN</label>
              <input
                value={form.gstin}
                onChange={(e) =>
                  setForm({ ...form, gstin: e.target.value.toUpperCase() })
                }
                className="input"
                placeholder="22AAAAA0000A1Z5"
              />
            </div>
            <div>
              <label className="label">Phone</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="input"
                placeholder="9876543210"
              />
            </div>
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="input"
                placeholder="client@email.com"
              />
            </div>
            <div>
              <label className="label">State</label>
              <select
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
                className="input"
              >
                <option value="">Select state</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Address</label>
              <textarea
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="input"
                rows={2}
                placeholder="Street, City, PIN"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="btn-ghost"
            >
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Saving..." : editingId ? "Update Client" : "Save Client"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="card p-8 text-center text-sm text-slate-500">Loading...</div>
      ) : clients.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-5.13a4 4 0 11-8 0 4 4 0 018 0zm6 0a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-slate-900 mb-1">No clients yet</h3>
          <p className="text-sm text-slate-500 mb-5">
            Save client details to quickly reuse them when creating invoices
          </p>
          <button onClick={openAdd} className="btn-primary">
            Add your first client
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map((client) => (
            <div key={client.id} className="card p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900">{client.name}</h3>
                  {client.gstin && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      GSTIN: {client.gstin}
                    </p>
                  )}
                </div>
              </div>
              <div className="space-y-1 text-sm text-slate-600">
                {client.phone && <p>Phone: {client.phone}</p>}
                {client.email && <p>Email: {client.email}</p>}
                {client.state && <p>State: {client.state}</p>}
                {client.address && (
                  <p className="whitespace-pre-line">{client.address}</p>
                )}
              </div>
              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => showHistory(client)}
                  className="text-sm text-primary-600 font-medium hover:underline"
                >
                  Invoice history
                </button>
                <button
                  onClick={() => openEdit(client)}
                  className="text-sm text-slate-600 font-medium hover:underline ml-auto"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(client)}
                  className="text-sm text-red-500 font-medium hover:underline"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {historyClient && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setHistoryClient(null)}
        >
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
          <div
            className="relative card max-w-2xl w-full p-6 max-h-[80vh] overflow-y-auto animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {historyClient.name} — Invoice History
                </h2>
                <p className="text-sm text-slate-500">
                  {historyInvoices.length} invoice{historyInvoices.length !== 1 ? "s" : ""}
                </p>
              </div>
              <button
                onClick={() => setHistoryClient(null)}
                className="text-slate-400 hover:text-slate-600 transition"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {historyLoading ? (
              <p className="text-sm text-slate-500 text-center py-8">Loading...</p>
            ) : historyInvoices.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8">
                No invoices for this client yet
              </p>
            ) : (
              <div className="space-y-2">
                {historyInvoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between rounded-lg border border-slate-100 p-3"
                  >
                    <div>
                      <p className="font-medium text-slate-900">
                        {inv.invoice_number}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatDate(inv.invoice_date)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-slate-900">
                        {formatINR(Number(inv.total))}
                      </span>
                      <StatusBadge status={inv.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
