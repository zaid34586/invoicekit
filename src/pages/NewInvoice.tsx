import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useUpgrade } from "../context/UpgradeContext";
import type { LineItem, Client, InvoiceStatus } from "../lib/types";
import {
  COUNTRIES,
  formatINR,
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
  convertCurrency,
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
  const { user, profile } = useAuth();
  const { openUpgrade } = useUpgrade();
  const navigate = useNavigate();
  const businessState = profile?.state ?? null;

  // Base currency comes from the business profile (defaults to INR)
  const baseCurrency = profile?.currency ?? "INR";

  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState(addDaysISO(15));
  const [status, setStatus] = useState<InvoiceStatus>("draft");
  const [clientName, setClientName] = useState("");
  const [clientCountry, setClientCountry] = useState("India");
  const [clientCountryCode, setClientCountryCode] = useState("+91");
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

  // ── Currency state ────────────────────────────────────────────────────────
  // invoiceCurrency is derived from the selected client country. The user can
  // also override the exchange rate manually (no live API for now).
  const invoiceCurrency = getCurrencyForCountry(clientCountry);
  const isForeignCurrency = invoiceCurrency !== baseCurrency;

  // Exchange rate: 1 base unit = exchangeRate invoice units
  // e.g. base=INR, invoice=USD → rate ≈ 0.012
  const [exchangeRate, setExchangeRate] = useState<number>(1);

  // Reset exchange rate to 1 whenever the currency changes
  useEffect(() => {
    setExchangeRate(1);
  }, [invoiceCurrency]);

  const currencySymbol = getCurrencySymbol(invoiceCurrency);
  // ─────────────────────────────────────────────────────────────────────────

  const statesForSelectedCountry = useMemo(() => {
    const country = COUNTRIES.find((c) => c.name === clientCountry);
    return country ? country.states : [];
  }, [clientCountry]);

  useEffect(() => {
    async function loadNextNumber() {
      if (!user) return;
      const { count } = await supabase
        .from("invoices")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);
      const next = (count ?? 0) + 1;
      setInvoiceNumber(`INV-${String(next).padStart(3, "0")}`);
    }
    loadNextNumber();
  }, [user]);

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
        businessCountry: profile?.country ?? "India", // profile country — extend when Profile adds country field
        businessState: businessState,
        clientCountry: clientCountry,
        clientState: clientState || null,
        defaultGstRate: items[0]?.gstRate ?? 18,
      }),
    [businessState, clientCountry, clientState, items]
  );

  // Converted amounts for display when invoice currency differs from base
  const displaySubtotal = isForeignCurrency ? convertCurrency(calc.subtotal, exchangeRate) : calc.subtotal;
  const displayCgst     = isForeignCurrency ? convertCurrency(calc.cgst, exchangeRate)     : calc.cgst;
  const displaySgst     = isForeignCurrency ? convertCurrency(calc.sgst, exchangeRate)     : calc.sgst;
  const displayIgst     = isForeignCurrency ? convertCurrency(calc.igst, exchangeRate)     : calc.igst;
  const displayTotal    = isForeignCurrency ? convertCurrency(calc.total, exchangeRate)    : calc.total;

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
    setClientCountry(client.country ?? "India");
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

    if (!profile?.is_pro) {
      const { count } = await supabase
        .from("invoices")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);
      if ((count ?? 0) >= FREE_PLAN_LIMIT) {
        openUpgrade();
        return;
      }
    }

    setSaving(true);
    const { data, error: insertErr } = await supabase
      .from("invoices")
      .insert({
        user_id: user.id,
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
        // GST fields always stored in base currency (INR) — unchanged
        subtotal: calc.subtotal,
        cgst: calc.cgst,
        sgst: calc.sgst,
        igst: calc.igst,
        total: calc.total,
        status,
        notes: notes.trim() || null,
        invoice_date: invoiceDate,
        due_date: dueDate,
        // ── Currency fields (locked at save time) ──
        invoice_currency: invoiceCurrency,
        exchange_rate: isForeignCurrency ? exchangeRate : 1,
        base_total: calc.total,  // always in base currency

        // ── Self-contained snapshot fields ──────────────────────────
        // Everything an invoice needs so Preview/PDF/Reports never have to
        // look back at Clients or Profile again. Business side is hardcoded
        // "India" to stay consistent with the decideTax() call above — this
        // is not a new decision, just persisting what was already computed.
        business_country: profile?.country ?? "India",
        business_state: businessState,
        business_currency: baseCurrency,

        client_country: clientCountry,

        base_currency: baseCurrency,
        exchange_rate_date: todayISO(),

        tax_type: taxDecision.taxType,
        tax_label: taxDecision.taxLabel,
        tax_note: taxDecision.taxNote,

        base_subtotal: calc.subtotal,
        invoice_subtotal: displaySubtotal,
        invoice_total: displayTotal,
      })
      .select("*")
      .single();

    setSaving(false);
    if (insertErr) {
      setError(insertErr.message);
      return;
    }

    // Auto-create client if not already saved
    const { data: existingClient } = await supabase
      .from("clients")
      .select("id")
      .eq("user_id", user.id)
      .ilike("name", clientName.trim())
      .maybeSingle();

    if (!existingClient) {
      await supabase.from("clients").insert({
        user_id: user.id,
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

    if (data) {
      navigate(`/invoice/${data.id}`);
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">New Invoice</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Fill in the details below to create a professional invoice
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
              <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-100 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 text-sm text-blue-700">
                  <span className="font-medium">Invoice currency: {invoiceCurrency}</span>
                  <span className="text-blue-500 ml-2">
                    (Base: {baseCurrency}) — enter exchange rate below
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm text-slate-600 whitespace-nowrap">
                    1 {baseCurrency} =
                  </span>
                  <input
                    type="number"
                    min={0.000001}
                    step="any"
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(Number(e.target.value) || 1)}
                    className="input w-28"
                  />
                  <span className="text-sm text-slate-600">{invoiceCurrency}</span>
                </div>
                <p className="text-xs text-blue-400 sm:hidden">
                  Rate will be locked once invoice is saved.
                </p>
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
                    <label className="text-xs text-slate-500 sm:hidden">GST %</label>
                    <select
                      value={item.gstRate}
                      onChange={(e) => updateItem(item.id, { gstRate: Number(e.target.value) })}
                      className="input"
                    >
                      {[0, 5, 12, 18, 28].map((r) => (
                        <option key={r} value={r}>{r}%</option>
                      ))}
                    </select>
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
                    Amount: {formatMoney(
                      isForeignCurrency
                        ? convertCurrency(lineAmount(item), exchangeRate)
                        : lineAmount(item),
                      invoiceCurrency
                    )}
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
              ) : (
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
              )}

              {calc.breakup.length > 0 && (
                <div className="pt-3 mt-3 border-t border-slate-100">
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
                    GST Breakup
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
                              isForeignCurrency ? convertCurrency(b.taxable, exchangeRate) : b.taxable,
                              invoiceCurrency
                            )}
                          </td>
                          <td className="text-right py-1">
                            {formatMoney(
                              isForeignCurrency ? convertCurrency(b.tax, exchangeRate) : b.tax,
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
                  ≈ {formatINR(calc.total)} (base {baseCurrency})
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
              {saving ? "Saving..." : "Save Invoice"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}