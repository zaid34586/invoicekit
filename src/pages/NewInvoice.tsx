import { getExchangeRate } from "../lib/exchangeRate";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useUpgrade } from "../context/UpgradeContext";
import type { LineItem, Client, InvoiceStatus } from "../lib/types";
import {
  COUNTRIES,
  todayISO,
  addDaysISO,
  FREE_PLAN_LIMIT,
  COUNTRY_SETTINGS,
} from "../lib/constants";
import { calculateInvoice, lineAmount } from "../lib/gst";
import {
  getCurrencyForCountry,
  getCurrencySymbol,
  formatMoney,
} from "../lib/currency";
import { decideTax } from "../lib/tax";

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function emptyItem(): LineItem {
  return {
    id: makeId(),
    description: "",
    qty: 1,
    rate: 0,
    gstRate: 18,
    hsnSac: "",
  };
}

const STATUS_OPTIONS: { value: InvoiceStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
];

// Tax label per country — only label/placeholder changes, db field stays "client_gstin"
function getTaxLabel(country: string): string {
  return (COUNTRY_SETTINGS as Record<string, { taxLabel: string }>)[country]?.taxLabel ?? "Tax ID";
}

function getTaxPlaceholder(country: string): string {
  switch (country) {
    case "India":           return "22AAAAA0000A1Z5";
    case "United Kingdom":  return "GB123456789";
    case "Australia":       return "12 345 678 901";
    case "United States":   return "12-3456789";
    case "Canada":          return "123456789RT0001";
    case "UAE":             return "100123456700003";
    case "Singapore":       return "M90312345A";
    default:                return "Tax ID";
  }
}

export default function NewInvoice() {
  const { user, profile, workspaceOwnerId } = useAuth();
  const { openUpgrade } = useUpgrade();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("edit");
  const duplicateId = searchParams.get("duplicate");
  const sourceInvoiceId = editId ?? duplicateId;
  const isEditMode = Boolean(editId);
  const isDuplicateMode = Boolean(duplicateId);
  const businessState = profile?.state ?? null;

  // Base currency comes from the business profile (defaults to INR)
  const baseCurrency = profile?.currency ?? "USD";

  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState(addDaysISO(15));
  const [status, setStatus] = useState<InvoiceStatus>("draft");
  const [clientName, setClientName] = useState("");
  const [clientCountry, setClientCountry] = useState(
  profile?.country ?? "United States"
);
  const [clientCountryCode, setClientCountryCode] = useState(
  profile?.country_code ?? ""
);
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientState, setClientState] = useState("");
  const [clientGstin, setClientGstin] = useState("");
  const [items, setItems] = useState<LineItem[]>([emptyItem()]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [sourceLoading, setSourceLoading] = useState(Boolean(sourceInvoiceId));

  // ── Currency state ────────────────────────────────────────────────────────
  // invoiceCurrency is derived from the selected client country. The user can
  // also override the exchange rate manually (no live API for now).
  const invoiceCurrency = getCurrencyForCountry(clientCountry);
  const isForeignCurrency = invoiceCurrency !== baseCurrency;

  // Exchange rate: 1 base unit = exchangeRate invoice units
  // e.g. base=USD, invoice=CAD → rate ≈ 1.37
  // Auto-fetched live from exchangeRate.ts (Frankfurter API). Manual override
  // is available via "Edit rate" for edge cases, but the default experience
  // is fully automatic — no one should have to look up a rate themselves.
  const [exchangeRate, setExchangeRate] = useState<number>(1);
  const [rateLoading, setRateLoading] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);
  const [rateManualOverride, setRateManualOverride] = useState(false);
  const [rateUpdatedAt, setRateUpdatedAt] = useState<string | null>(null);

  // Auto-fetch whenever currency changes, unless the user chose to override manually
  useEffect(() => {
  async function loadRate() {
    if (invoiceCurrency === baseCurrency) {
      setExchangeRate(1);
      setRateError(null);
      setRateManualOverride(false);
      return;
    }

    if (rateManualOverride) return;

    setRateLoading(true);
    setRateError(null);

    try {
      const result = await getExchangeRate(
        baseCurrency,
        invoiceCurrency
      );

      setExchangeRate(result.rate);
      setRateUpdatedAt(result.lastUpdated);
    } catch (err) {
      console.error(err);
      setRateError(
        "Couldn't fetch the live rate automatically. You can enter it manually below."
      );
      setRateManualOverride(true);
    } finally {
      setRateLoading(false);
    }
  }

  loadRate();
}, [baseCurrency, invoiceCurrency, rateManualOverride]);

  async function handleRefreshRate() {
    if (invoiceCurrency === baseCurrency) return;
    setRateLoading(true);
    setRateError(null);
    try {
      const result = await getExchangeRate(baseCurrency, invoiceCurrency);
      setExchangeRate(result.rate);
      setRateUpdatedAt(result.lastUpdated);
      setRateManualOverride(false);
    } catch (err) {
      console.error(err);
      setRateError("Still couldn't fetch the live rate. Try again in a moment.");
    } finally {
      setRateLoading(false);
    }
  }

  const currencySymbol = getCurrencySymbol(invoiceCurrency);
  // ─────────────────────────────────────────────────────────────────────────

  const statesForSelectedCountry = useMemo(() => {
    const country = COUNTRIES.find((c) => c.name === clientCountry);
    return country ? country.states : [];
  }, [clientCountry]);

  useEffect(() => {
    async function loadNextNumber() {
      if (!user || isEditMode) return;
      const { count } = await supabase
        .from("invoices")
        .select("*", { count: "exact", head: true })
        .eq("user_id", workspaceOwnerId || user.id);
      const next = (count ?? 0) + 1;
      setInvoiceNumber(`INV-${String(next).padStart(3, "0")}`);
    }
    loadNextNumber();
  }, [user, isEditMode]);

  useEffect(() => {
    async function loadSourceInvoice() {
      if (!user || !sourceInvoiceId) {
        setSourceLoading(false);
        return;
      }

      setSourceLoading(true);
      const { data, error: loadError } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", sourceInvoiceId)
        .eq("user_id", workspaceOwnerId || user.id)
        .single();

      if (loadError || !data) {
        setError(loadError?.message ?? "Invoice not found");
        setSourceLoading(false);
        return;
      }

      const invoice = data as import("../lib/types").Invoice;
      const country = invoice.client_country ?? profile?.country ?? "United States";
      const countryCode = COUNTRIES.find((item) => item.name === country)?.code ?? "";
      const storedPhone = invoice.client_phone ?? "";
      const phoneWithoutCode = countryCode && storedPhone.startsWith(countryCode)
        ? storedPhone.slice(countryCode.length).trim()
        : storedPhone;

      if (isEditMode) setInvoiceNumber(invoice.invoice_number);
      setInvoiceDate(isDuplicateMode ? todayISO() : invoice.invoice_date);
      setDueDate(isDuplicateMode ? addDaysISO(15) : invoice.due_date);
      setStatus(isDuplicateMode ? "draft" : invoice.status);
      setClientName(invoice.client_name);
      setClientCountry(country);
      setClientCountryCode(countryCode);
      setClientPhone(phoneWithoutCode);
      setClientEmail(invoice.client_email ?? "");
      setClientAddress(invoice.client_address ?? "");
      setClientState(invoice.client_state ?? "");
      setClientGstin(invoice.client_gstin ?? "");
      setItems((invoice.items ?? []).map((item) => ({ ...item, id: makeId() })));
      setNotes(invoice.notes ?? "");

      if (invoice.exchange_rate && Number(invoice.exchange_rate) > 0) {
        setExchangeRate(Number(invoice.exchange_rate));
        setRateManualOverride(true);
      }

      setSourceLoading(false);
    }

    loadSourceInvoice();
  }, [user, sourceInvoiceId, isEditMode, isDuplicateMode, profile?.country]);

  useEffect(() => {
    async function loadClients() {
      if (!user) return;
      const { data } = await supabase
        .from("clients")
        .select("*")
        .order("name", { ascending: true });
      if (data) setClients(data as Client[]);
    }
    loadClients();
  }, [user]);

  // GST calc stays in base currency (INR) — this never changes
  const calc = useMemo(
    () => calculateInvoice(items, businessState, clientState || null),
    [items, businessState, clientState]
  );

  // Tax decision — determines label, note, and tax type for display.
  // Does NOT affect gst.ts calculations; it only drives what the UI shows.
  const taxDecision = useMemo(
    () =>
      decideTax({
        businessCountry: profile?.country ?? null,
        businessState: businessState,
        clientCountry: clientCountry,
        clientState: clientState || null,
        defaultGstRate: items[0]?.gstRate ?? 18,
      }),
    [businessState, clientCountry, clientState, items]
  );

  // Priority 1: for every country except India, tax is fully automatic —
  // the rate the tax engine decided IS the rate used in the calculation.
  // No manual selection. India keeps its existing per-item GST-slab picker,
  // since real Indian invoices commonly mix multiple HSN/GST rates on one
  // invoice — that is correct behaviour, not something to automate away.
  useEffect(() => {
    if (profile?.country === "India") return;

    setItems((prev) => {
      const needsUpdate = prev.some((it) => it.gstRate !== taxDecision.taxRate);
      if (!needsUpdate) return prev;
      return prev.map((it) => ({ ...it, gstRate: taxDecision.taxRate }));
    });
  }, [taxDecision.taxRate, profile?.country]);

  // Item rates are entered directly in the selected invoice currency.
  // Therefore calc.* is already expressed in invoiceCurrency and must never
  // be multiplied by the exchange rate again. The exchange rate is used only
  // to derive the business/base-currency equivalent stored for reporting.
  const displaySubtotal = calc.subtotal;
  const displayCgst = calc.cgst;
  const displaySgst = calc.sgst;
  const displayIgst = calc.igst;
  const displayTotal = calc.total;

  const toBaseCurrency = (amount: number) =>
    isForeignCurrency && exchangeRate > 0
      ? Math.round((amount / exchangeRate) * 100) / 100
      : amount;

  const baseSubtotal = toBaseCurrency(calc.subtotal);
  const baseCgst = toBaseCurrency(calc.cgst);
  const baseSgst = toBaseCurrency(calc.sgst);
  const baseIgst = toBaseCurrency(calc.igst);
  const baseTotal = toBaseCurrency(calc.total);

  function updateItem(id: string, patch: Partial<LineItem>) {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...patch } : it))
    );
  }

  function addItem() {
    setItems((prev) => [...prev, emptyItem()]);
  }

  function deleteItem(id: string) {
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.id !== id) : prev));
  }

  function handleCountryChange(countryName: string) {
    setClientCountry(countryName);
    const country = COUNTRIES.find((c) => c.name === countryName);
    setClientCountryCode(country ? country.code : "");
    setClientState("");
  }

  function selectClient(client: Client) {
    setClientName(client.name);
    setClientCountry(
  client.country ??
  profile?.country ??
  "United States"
);
    setClientCountryCode(
      client.country_code ??
        COUNTRIES.find((c) => c.name === (client.country ?? "India"))?.code ??
        "+91"
    );
    setClientPhone(client.phone ?? "");
    setClientEmail(client.email ?? "");
    setClientAddress(client.address ?? "");
    setClientState(client.state ?? "");
    setClientGstin(client.gstin ?? "");
  }

  async function handleSave() {
    if (!user) return;
    setError(null);

    if (!clientName.trim()) {
      setError("Client name is required");
      return;
    }
    if (items.some((it) => !it.description.trim())) {
      setError("All line items need a description");
      return;
    }

    if (!isEditMode && !profile?.is_pro) {
      const { count } = await supabase
        .from("invoices")
        .select("*", { count: "exact", head: true })
        .eq("user_id", workspaceOwnerId || user.id);
      if ((count ?? 0) >= FREE_PLAN_LIMIT) {
        openUpgrade();
        return;
      }
    }

    const payload = {
      user_id: workspaceOwnerId || user.id,
      invoice_number: invoiceNumber,
      client_name: clientName.trim(),
      client_phone: clientPhone.trim()
        ? `${clientCountryCode} ${clientPhone.trim()}`
        : null,
      client_email: clientEmail.trim() || null,
      client_address: clientAddress.trim() || null,
      client_state: clientState || null,
      client_gstin: clientGstin.trim().toUpperCase() || null,
      items,
      subtotal: baseSubtotal,
      cgst: baseCgst,
      sgst: baseSgst,
      igst: baseIgst,
      total: baseTotal,
      status,
      notes: notes.trim() || null,
      invoice_date: invoiceDate,
      due_date: dueDate,
      invoice_currency: invoiceCurrency,
      exchange_rate: isForeignCurrency ? exchangeRate : 1,
      base_total: baseTotal,
      business_country: profile?.country ?? "India",
      business_state: businessState,
      business_currency: baseCurrency,
      client_country: clientCountry,
      base_currency: baseCurrency,
      exchange_rate_date: todayISO(),
      tax_type: taxDecision.taxType,
      tax_label: taxDecision.taxLabel,
      tax_note: taxDecision.taxNote,
      base_subtotal: baseSubtotal,
      invoice_subtotal: calc.subtotal,
      invoice_total: calc.total,
    };

    setSaving(true);
    const query = isEditMode && editId
      ? supabase
          .from("invoices")
          .update(payload)
          .eq("id", editId)
          .eq("user_id", workspaceOwnerId || user.id)
      : supabase.from("invoices").insert(payload);

    const { data, error: saveError } = await query.select("*").single();
    setSaving(false);

    if (saveError) {
      setError(saveError.message);
      return;
    }

    if (!isEditMode) {
      const { data: existingClient } = await supabase
        .from("clients")
        .select("id")
        .eq("user_id", workspaceOwnerId || user.id)
        .ilike("name", clientName.trim())
        .maybeSingle();

      if (!existingClient) {
        await supabase.from("clients").insert({
          user_id: workspaceOwnerId || user.id,
          name: clientName.trim(),
          phone: clientPhone.trim() || null,
          email: clientEmail.trim() || null,
          address: clientAddress.trim() || null,
          state: clientState || null,
          gstin: clientGstin.trim().toUpperCase() || null,
          country: clientCountry,
          country_code: clientCountryCode,
        });
      }
    }

    if (data) navigate(`/invoice/${data.id}`);
  }

  if (sourceLoading) {
    return <div className="card p-8 text-center text-sm text-slate-500">Loading invoice...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {isEditMode ? "Edit Invoice" : isDuplicateMode ? "Duplicate Invoice" : "New Invoice"}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {isEditMode
              ? "Update the invoice details below"
              : isDuplicateMode
                ? "Review the copied details and save as a new invoice"
                : "Fill in the details below to create a professional invoice"}
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">

          {/* Invoice Details */}
          <div className="card p-5 sm:p-6">
            <h2 className="text-base font-semibold text-slate-900 mb-4">
              Invoice Details
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <label className="label">Invoice Number</label>
                <input
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className="input bg-slate-50"
                />
              </div>
              <div>
                <label className="label">Invoice Date</label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as InvoiceStatus)}
                  className="input"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Client Details */}
          <div className="card p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-slate-900">
                Client Details
              </h2>
              {clients.length > 0 && (
                <select
                  value=""
                  onChange={(e) => {
                    const c = clients.find((cl) => cl.id === e.target.value);
                    if (c) selectClient(c);
                  }}
                  className="input text-sm py-1.5 w-auto"
                >
                  <option value="">Select saved client</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">
                  Client Name <span className="text-red-500">*</span>
                </label>
                <input
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="input"
                  placeholder="Acme Corp"
                />
              </div>
              <div>
                {/* Label and placeholder are dynamic; db field stays client_gstin */}
                <label className="label">Client {getTaxLabel(clientCountry)}</label>
                <input
                  value={clientGstin}
                  onChange={(e) => setClientGstin(e.target.value.toUpperCase())}
                  className="input"
                  placeholder={getTaxPlaceholder(clientCountry)}
                />
              </div>
              <div>
                <label className="label">Country</label>
                <select
                  value={clientCountry}
                  onChange={(e) => handleCountryChange(e.target.value)}
                  className="input"
                >
                  {COUNTRIES.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Phone</label>
                <div className="flex gap-2">
                  <span className="input w-20 flex-none bg-slate-50 text-slate-500 flex items-center justify-center">
                    {clientCountryCode}
                  </span>
                  <input
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    className="input flex-1"
                    placeholder="9876543210"
                  />
                </div>
              </div>
              <div>
                <label className="label">Email</label>
                <input
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  className="input"
                  placeholder="client@email.com"
                />
              </div>
              <div>
                <label className="label">State</label>
                <select
                  value={clientState}
                  onChange={(e) => setClientState(e.target.value)}
                  className="input"
                >
                  <option value="">Select state</option>
                  {statesForSelectedCountry.map((s: string) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label">Address</label>
                <textarea
                  value={clientAddress}
                  onChange={(e) => setClientAddress(e.target.value)}
                  className="input"
                  rows={2}
                  placeholder="Street, City, PIN"
                />
              </div>
            </div>

            {/* ── Exchange rate row — only visible when invoice currency ≠ base ── */}
            {isForeignCurrency && (
              <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-100">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 text-sm text-blue-700">
                    <span className="font-medium">Invoice currency: {invoiceCurrency}</span>
                    <span className="text-blue-500 ml-2">
                      (Base: {baseCurrency}) — live exchange rate
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm text-slate-600 whitespace-nowrap">
                      1 {baseCurrency} =
                    </span>
                    {rateManualOverride ? (
                      <input
                        type="number"
                        min={0.000001}
                        step="any"
                        value={exchangeRate}
                        onChange={(e) => setExchangeRate(Number(e.target.value) || 1)}
                        className="input w-28"
                        autoFocus
                      />
                    ) : (
                      <span className="font-semibold text-slate-900">
                        {rateLoading ? "…" : exchangeRate}
                      </span>
                    )}
                    <span className="text-sm text-slate-600">{invoiceCurrency}</span>
                    {rateLoading && (
                      <span className="text-xs text-blue-400 animate-pulse">Fetching live rate…</span>
                    )}
                  </div>
                  {!rateLoading && (
                    <button
                      type="button"
                      onClick={() =>
                        rateManualOverride ? handleRefreshRate() : setRateManualOverride(true)
                      }
                      className="text-xs text-primary-600 hover:underline shrink-0"
                    >
                      {rateManualOverride ? "Use live rate" : "Edit manually"}
                    </button>
                  )}
                </div>
                {rateError && (
                  <p className="text-xs text-red-600 mt-2">{rateError}</p>
                )}
                {!rateError && !rateManualOverride && rateUpdatedAt && (
                  <p className="text-xs text-blue-400 mt-2">
                    Auto-fetched rate as of {rateUpdatedAt}. Locked once the invoice is saved.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Line Items */}
          <div className="card p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-slate-900">Line Items</h2>
              <button onClick={addItem} className="btn-ghost text-primary-600 text-sm">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add item
              </button>
            </div>

            <div className="space-y-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-12 gap-2 items-start bg-slate-50 rounded-lg p-3"
                >
                  <div className="col-span-12 sm:col-span-4">
                    <label className="text-xs text-slate-500 sm:hidden">Description</label>
                    <input
                      value={item.description}
                      onChange={(e) => updateItem(item.id, { description: e.target.value })}
                      className="input"
                      placeholder="Item description"
                    />
                  </div>
                  <div className="col-span-6 sm:col-span-2">
                    <label className="text-xs text-slate-500 sm:hidden">
                      {clientCountry === "India" ? "HSN/SAC" : "Tax Code"}
                    </label>
                    <input
                      value={item.hsnSac}
                      onChange={(e) => updateItem(item.id, { hsnSac: e.target.value.toUpperCase() })}
                      className="input"
                      placeholder={clientCountry === "India" ? "HSN / SAC" : "Tax Code"}
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <label className="text-xs text-slate-500 sm:hidden">Qty</label>
                    <input
                      type="number"
                      min={0}
                      value={item.qty}
                      onChange={(e) => updateItem(item.id, { qty: Number(e.target.value) })}
                      className="input min-w-[90px]"
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <label className="text-xs text-slate-500 sm:hidden">
                      Rate ({currencySymbol})
                    </label>
                    <div className="flex">
                      <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-slate-300 bg-slate-50 text-sm font-medium text-slate-600">
                        {currencySymbol}
                      </span>
                      <input
                        type="number"
                        min={0}
                        value={item.rate === 0 ? "" : item.rate}
                        onChange={(e) =>
                          updateItem(item.id, {
                            rate: e.target.value === "" ? 0 : Number(e.target.value),
                          })
                        }
                        className="input rounded-l-none"
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div className="col-span-3 sm:col-span-2">
                    <label className="text-xs text-slate-500 sm:hidden">
                      {profile?.country === "India" ? "GST %" : taxDecision.taxLabel}
                    </label>
                    {profile?.country === "India" ? (
                      <select
                        value={item.gstRate}
                        onChange={(e) => updateItem(item.id, { gstRate: Number(e.target.value) })}
                        className="input"
                      >
                        {[0, 5, 12, 18, 28].map((r) => (
                          <option key={r} value={r}>{r}%</option>
                        ))}
                      </select>
                    ) : (
                      <div
                        className="input flex items-center bg-slate-100 text-slate-600 cursor-not-allowed"
                        title={`${taxDecision.taxLabel} — set automatically from ${clientCountry || "client country"}. Not editable.`}
                      >
                        {taxDecision.taxRate}%
                      </div>
                    )}
                  </div>
                  <div className="col-span-1 flex items-center justify-center h-10">
                    {items.length > 1 && (
                      <button
                        onClick={() => deleteItem(item.id)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg p-2 transition"
                        aria-label="Delete item"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <div className="col-span-12 text-right text-sm font-medium text-slate-700">
                    Amount: {formatMoney(lineAmount(item), invoiceCurrency)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="card p-5 sm:p-6">
            <label className="label">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input"
              rows={3}
              placeholder="Payment terms, bank details, thank you note..."
            />
          </div>
        </div>

        {/* Summary sidebar */}
        <div className="lg:col-span-1">
          <div className="card p-5 sm:p-6 sticky top-20">
            <h2 className="text-base font-semibold text-slate-900 mb-4">Summary</h2>

            {/* Show currency badge when invoice is in a foreign currency */}
            {isForeignCurrency && (
              <div className="mb-3 text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-600 font-medium inline-block">
                {invoiceCurrency} @ {exchangeRate} / {baseCurrency}
              </div>
            )}

            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Subtotal</span>
                <span className="font-medium text-slate-900">
                  {formatMoney(displaySubtotal, invoiceCurrency)}
                </span>
              </div>

              {calc.isInterState ? (
                <div className="flex justify-between">
                  <span className="text-slate-500">{taxDecision.taxLabel}</span>
                  <span className="font-medium text-slate-900">
                    {formatMoney(displayIgst, invoiceCurrency)}
                  </span>
                </div>
              ) : taxDecision.isZeroRated ? (
                <div className="flex justify-between">
                  <span className="text-slate-500">{taxDecision.taxLabel}</span>
                  <span className="font-medium text-slate-900">—</span>
                </div>
              ) : profile?.country === "India" ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-500">CGST</span>
                    <span className="font-medium text-slate-900">
                      {formatMoney(displayCgst, invoiceCurrency)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">SGST</span>
                    <span className="font-medium text-slate-900">
                      {formatMoney(displaySgst, invoiceCurrency)}
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between">
                  <span className="text-slate-500">{taxDecision.taxLabel}</span>
                  <span className="font-medium text-slate-900">
                    {formatMoney(displayCgst + displaySgst, invoiceCurrency)}
                  </span>
                </div>
              )}

              {calc.breakup.length > 0 && (
                <div className="pt-3 mt-3 border-t border-slate-100">
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
                    {profile?.country === "India" ? "GST Breakup" : `${taxDecision.taxLabel} Breakdown`}
                  </p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-400">
                        <th className="text-left font-medium pb-1">Rate</th>
                        <th className="text-right font-medium pb-1">Taxable</th>
                        <th className="text-right font-medium pb-1">Tax</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calc.breakup.map((b) => (
                        <tr key={b.rate} className="text-slate-600">
                          <td className="py-1">{b.rate}%</td>
                          <td className="text-right py-1">
                            {formatMoney(
                              b.taxable,
                              invoiceCurrency
                            )}
                          </td>
                          <td className="text-right py-1">
                            {formatMoney(
                              b.tax,
                              invoiceCurrency
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="pt-3 mt-3 border-t border-slate-200 flex justify-between items-center">
                <span className="font-semibold text-slate-900">Grand Total</span>
                <span className="text-xl font-bold text-primary-600">
                  {formatMoney(displayTotal, invoiceCurrency)}
                </span>
              </div>

              {/* Show base equivalent when foreign currency is used */}
              {isForeignCurrency && (
                <p className="text-xs text-slate-400 text-right">
                  ≈ {formatMoney(calc.total, baseCurrency)} (base {baseCurrency})
                </p>
              )}
            </div>

            <div className="mt-2 text-xs text-slate-400">
              {taxDecision.taxNote}
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary w-full mt-5"
            >
              {saving ? "Saving..." : isEditMode ? "Update Invoice" : isDuplicateMode ? "Save Duplicate" : "Save Invoice"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
