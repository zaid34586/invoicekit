import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { Invoice, Profile } from "../lib/types";
import { formatDate } from "../lib/constants";
import { convertCurrency, formatMoney } from "../lib/currency";
import { lineAmount } from "../lib/gst";

export default function ShareInvoice() {
  const { token } = useParams<{ token: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPayModal, setShowPayModal] = useState(false);
  const [paymentAvailable, setPaymentAvailable] = useState(false);
  const [paymentProvider, setPaymentProvider] = useState<"paypal" | "stripe" | null>(null);
  const [paymentEnvironment, setPaymentEnvironment] = useState<"sandbox" | "live" | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function callPayment(functionName: "paypal-invoice-payments" | "stripe-invoice-payments", body: Record<string, unknown>) {
    const { data, error: functionError } = await supabase.functions.invoke(functionName, { body });
    if (functionError) {
      let detail = functionError.message;
      try {
        const response = (functionError as { context?: Response }).context;
        if (response) detail = (await response.clone().json())?.error || detail;
      } catch { /* keep the function error */ }
      throw new Error(detail);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }

  useEffect(() => {
    async function load() {
      if (!token) return;
      // These call SECURITY DEFINER Postgres functions that only ever
      // return the single row matching this exact token — not a filtered
      // table query, so there is no way to scan/list other users' shared
      // invoices. See supabase/migrations/20260707130000_secure_invoice_sharing.sql
      const { data: invRows, error: invErr } = await supabase.rpc(
        "get_shared_invoice",
        { p_token: token }
      );

      const invData = Array.isArray(invRows) ? invRows[0] : invRows;

      if (invErr || !invData) {
        setError("This invoice link is no longer available.");
        setLoading(false);
        return;
      }

      const inv = invData as Invoice;
      setInvoice(inv);

      const { data: profRows } = await supabase.rpc(
        "get_shared_invoice_profile",
        { p_token: token }
      );
      const profData = Array.isArray(profRows) ? profRows[0] : profRows;

      if (profData) {
        setProfile(profData as Profile);
      }

      try {
        const [paypal, stripe] = await Promise.all([
          callPayment("paypal-invoice-payments", { action: "availability", shareToken: token }),
          callPayment("stripe-invoice-payments", { action: "availability", shareToken: token }),
        ]);
        const availability = paypal.available ? paypal : stripe;
        setPaymentAvailable(Boolean(availability.available));
        setPaymentProvider(availability.provider || null);
        setPaymentEnvironment(availability.environment || null);
      } catch {
        setPaymentAvailable(false);
      }

      const query = new URLSearchParams(window.location.search);
      if (query.get("payment") === "paypal-return") {
        if (query.get("cancelled") === "1") {
          setPaymentMessage({ type: "error", text: "PayPal checkout was cancelled. No payment was taken." });
        } else if (query.get("token")) {
          setPaymentLoading(true);
          try {
            const result = await callPayment("paypal-invoice-payments", { action: "capture_order", shareToken: token, orderId: query.get("token") });
            if (result.paid) {
              setInvoice({ ...inv, status: "paid" });
              setPaymentMessage({ type: "success", text: `Payment successful. Receipt reference: ${result.captureId}` });
            }
          } catch (captureError) {
            setPaymentMessage({ type: "error", text: captureError instanceof Error ? captureError.message : "Payment verification failed" });
          } finally {
            setPaymentLoading(false);
            window.history.replaceState({}, "", window.location.pathname);
          }
        }
      } else if (query.get("payment") === "stripe-cancelled") {
        setPaymentMessage({ type: "error", text: "Stripe checkout was cancelled. No payment was taken." });
        window.history.replaceState({}, "", window.location.pathname);
      } else if (query.get("payment") === "stripe-return" && query.get("session_id")) {
        setPaymentLoading(true);
        try {
          const result = await callPayment("stripe-invoice-payments", { action: "verify_session", shareToken: token, sessionId: query.get("session_id") });
          if (result.paid) {
            setInvoice({ ...inv, status: "paid" });
            setPaymentMessage({ type: "success", text: `Payment successful. Receipt reference: ${result.paymentId}` });
          }
        } catch (stripeError) {
          setPaymentMessage({ type: "error", text: stripeError instanceof Error ? stripeError.message : "Stripe payment verification failed" });
        } finally {
          setPaymentLoading(false);
          window.history.replaceState({}, "", window.location.pathname);
        }
      }
      setLoading(false);
    }
    load();
  }, [token]);

  async function startPayment() {
    if (!token || !paymentAvailable) return;
    setPaymentLoading(true);
    setPaymentMessage(null);
    try {
      if (paymentProvider === "stripe") {
        const result = await callPayment("stripe-invoice-payments", { action: "create_session", shareToken: token });
        if (!result.checkoutUrl) throw new Error("Stripe checkout link was not returned");
        window.location.assign(result.checkoutUrl);
      } else {
        const result = await callPayment("paypal-invoice-payments", { action: "create_order", shareToken: token });
        if (!result.approvalUrl) throw new Error("PayPal checkout link was not returned");
        window.location.assign(result.approvalUrl);
      }
    } catch (paymentError) {
      setPaymentMessage({ type: "error", text: paymentError instanceof Error ? paymentError.message : "Could not open PayPal" });
      setPaymentLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          <p className="text-sm text-slate-500">Loading invoice...</p>
        </div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="card max-w-md w-full p-8 text-center">
          <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-slate-900 mb-2">
            Invoice Unavailable
          </h1>
          <p className="text-sm text-slate-500">
            {error || "This invoice could not be found."}
          </p>
        </div>
      </div>
    );
  }
  const invoiceCurrency =
  invoice.invoice_currency ??
  invoice.business_currency ??
  profile?.currency ??
  "USD";

  const isInterState = invoice.igst > 0;
  const baseCurrency =
    invoice.base_currency ?? invoice.business_currency ?? profile?.currency ?? "USD";
  const isForeignCurrency = invoiceCurrency !== baseCurrency;
  const exchangeRate = invoice.exchange_rate ?? 1;

  const itemSubtotal = invoice.items.reduce(
    (sum, item) => sum + lineAmount(item),
    0
  );
  const displayCgst = isForeignCurrency
    ? convertCurrency(Number(invoice.cgst), exchangeRate)
    : Number(invoice.cgst);
  const displaySgst = isForeignCurrency
    ? convertCurrency(Number(invoice.sgst), exchangeRate)
    : Number(invoice.sgst);
  const displayIgst = isForeignCurrency
    ? convertCurrency(Number(invoice.igst), exchangeRate)
    : Number(invoice.igst);
  const displaySubtotal = itemSubtotal;
  const displayTotal =
    displaySubtotal + displayCgst + displaySgst + displayIgst;

  return (
    <div className="min-h-screen bg-slate-50 py-6 px-4">
      <div className="max-w-4xl mx-auto space-y-4">
        {paymentMessage && (
          <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${paymentMessage.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
            {paymentMessage.text}
          </div>
        )}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-sm font-bold">⚡</span>
            </div>
            <span className="font-bold text-slate-900">Rivox</span>
          </div>
          {invoice.status !== "paid" && invoice.status !== "draft" && (
            <button
              onClick={() => setShowPayModal(true)}
              className="bg-green-600 text-white font-semibold rounded-lg px-5 py-2.5 hover:bg-green-700 transition active:scale-[0.98]"
            >
              Pay Invoice
            </button>
          )}
        </div>

        <div className="card p-6 sm:p-10">
          <div className="flex flex-col sm:flex-row sm:justify-between gap-6 pb-6 border-b border-slate-200">
            <div className="flex items-start gap-4">
              {profile?.logo_url ? (
                <img
                  src={profile.logo_url}
                  alt="Logo"
                  className="w-16 h-16 rounded-lg object-cover border border-slate-200"
                />
              ) : (
                <div className="w-16 h-16 bg-primary-600 rounded-lg flex items-center justify-center">
                  <span className="text-white text-2xl font-bold">⚡</span>
                </div>
              )}
              <div>
                <h1 className="text-xl font-bold text-slate-900">
                  {profile?.business_name || "Business"}
                </h1>
                {profile?.address && (
                  <p className="text-sm text-slate-500 mt-1 max-w-xs whitespace-pre-line">
                    {profile.address}
                  </p>
                )}
                {profile?.gstin && (
                  <p className="text-sm text-slate-500 mt-1">
                    GSTIN: {profile.gstin}
                  </p>
                )}
                {profile?.phone && (
                  <p className="text-sm text-slate-500">Phone: {profile.phone}</p>
                )}
                {profile?.email && (
                  <p className="text-sm text-slate-500">Email: {profile.email}</p>
                )}
              </div>
            </div>

            <div className="sm:text-right">
              <span className="inline-block bg-primary-600 text-white px-4 py-1.5 rounded-lg text-sm font-bold tracking-wide">
                INVOICE
              </span>
              <p className="text-lg font-bold text-slate-900 mt-3">
                {invoice.invoice_number}
              </p>
              <p className="text-sm text-slate-500 mt-1">
                Invoice Date: {formatDate(invoice.invoice_date)}
              </p>
              <p className="text-sm text-slate-500">
                Due Date: {formatDate(invoice.due_date)}
              </p>
            </div>
          </div>

          <div className="py-6 border-b border-slate-200">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
              Bill To
            </p>
            <p className="text-base font-semibold text-slate-900">
              {invoice.client_name}
            </p>
            {invoice.client_gstin && (
              <p className="text-sm text-slate-500 mt-1">
                GSTIN: {invoice.client_gstin}
              </p>
            )}
            {invoice.client_address && (
              <p className="text-sm text-slate-500 mt-1 whitespace-pre-line">
                {invoice.client_address}
              </p>
            )}
            {invoice.client_state && (
              <p className="text-sm text-slate-500">{invoice.client_state}</p>
            )}
            {invoice.client_phone && (
              <p className="text-sm text-slate-500">Phone: {invoice.client_phone}</p>
            )}
            {invoice.client_email && (
              <p className="text-sm text-slate-500">Email: {invoice.client_email}</p>
            )}
          </div>

          <div className="py-6">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-primary-600 text-white">
                    <th className="text-left text-xs font-semibold uppercase tracking-wide px-4 py-3 rounded-l-lg">
                      Description
                    </th>
                    <th className="text-center text-xs font-semibold uppercase tracking-wide px-4 py-3">
                      HSN/SAC
                    </th>
                    <th className="text-center text-xs font-semibold uppercase tracking-wide px-4 py-3">
                      Qty
                    </th>
                    <th className="text-right text-xs font-semibold uppercase tracking-wide px-4 py-3">
                      Rate
                    </th>
                    <th className="text-center text-xs font-semibold uppercase tracking-wide px-4 py-3">
                      GST
                    </th>
                    <th className="text-right text-xs font-semibold uppercase tracking-wide px-4 py-3 rounded-r-lg">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((item, idx) => (
                    <tr
                      key={item.id}
                      className={idx % 2 === 1 ? "bg-slate-50" : "bg-white"}
                    >
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {item.description}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500 text-center">
                        {item.hsnSac || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700 text-center">
                        {item.qty}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700 text-right">
                        {formatMoney(item.rate, invoiceCurrency)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700 text-center">
                        {item.gstRate}%
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-900 text-right">
                        {formatMoney(lineAmount(item), invoiceCurrency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-6 pb-6">
            <div className="flex-1">
              {isInterState ? (
                <GSTBreakup
  title="IGST Breakup"
  items={invoice.items}
  type="igst"
  currency={invoiceCurrency}
/>
              ) : invoice.cgst > 0 || invoice.sgst > 0 ? (
                <GSTBreakup
  title="CGST + SGST Breakup"
  items={invoice.items}
  type="cgstsgst"
  currency={invoiceCurrency}
/>
              ) : null}
            </div>

            <div className="sm:w-64 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Subtotal</span>
                <span className="font-medium text-slate-900">
                  {formatMoney(displaySubtotal, invoiceCurrency)}
                </span>
              </div>
              {isInterState ? (
                <div className="flex justify-between">
                  <span className="text-slate-500">IGST</span>
                  <span className="font-medium text-slate-900">
                    {formatMoney(displayIgst, invoiceCurrency)}
                  </span>
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
              <div className="bg-primary-600 text-white rounded-lg px-4 py-3 flex justify-between items-center mt-3">
                <span className="font-semibold">Grand Total</span>
                <span className="text-lg font-bold">
                  {formatMoney(displayTotal, invoiceCurrency)}
                </span>
              </div>
            </div>
          </div>

          {invoice.notes && (
            <div className="py-4 border-t border-slate-200">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
                Notes
              </p>
              <p className="text-sm text-slate-600 whitespace-pre-line">
                {invoice.notes}
              </p>
            </div>
          )}

          <div className="pt-6 border-t border-slate-200 text-center">
            <p className="text-base font-semibold text-primary-600">
              Thank you for your business!
            </p>
            {!profile?.is_pro && (
              <p className="text-xs text-slate-400 mt-2">
                Created with Rivox
              </p>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-slate-400">
          Powered by{" "}
          <Link to="/" className="text-primary-600 font-medium hover:underline">
            Rivox
          </Link>
        </p>
      </div>

      {showPayModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setShowPayModal(false)}
        >
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
          <div
            className="relative card max-w-md w-full p-8 text-center animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowPayModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Pay Invoice</h2>
            <p className="text-sm text-slate-500 mb-1">
              Amount due: {formatMoney(displayTotal, invoiceCurrency)}
            </p>
            {paymentAvailable ? (
              <>
                <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-4 text-left">
                  <p className="text-sm font-bold text-blue-900">Pay securely with {paymentProvider === "stripe" ? "Stripe" : "PayPal"}</p>
                  <p className="mt-1 text-xs leading-5 text-blue-700">Payment goes directly to {profile?.business_name || "this business"}. Rivox does not store your card details.</p>
                  {paymentEnvironment === "sandbox" && <p className="mt-2 text-xs font-bold text-amber-700">Test mode — no real money will be charged.</p>}
                </div>
                <button onClick={startPayment} disabled={paymentLoading} className={`mt-5 w-full rounded-xl px-5 py-3 font-bold text-white disabled:opacity-60 ${paymentProvider === "stripe" ? "bg-[#635bff] hover:bg-[#5149e8]" : "bg-[#0070ba] hover:bg-[#005ea6]"}`}>
                  {paymentLoading ? "Opening secure checkout…" : `Continue to ${paymentProvider === "stripe" ? "Stripe" : "PayPal"}`}
                </button>
              </>
            ) : (
              <>
                <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-left">
                  <p className="text-sm font-bold text-amber-900">Online payment is not configured</p>
                  <p className="mt-1 text-xs leading-5 text-amber-700">Please contact {profile?.business_name || "the business"} directly to arrange payment.</p>
                </div>
                <button onClick={() => setShowPayModal(false)} className="btn-secondary w-full mt-5">Close</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function GSTBreakup({
  title,
  items,
  type,
  currency,
}: {
  title: string;
  items: Invoice["items"];
  type: "igst" | "cgstsgst";
  currency: string;
}) {
  const merged = new Map<number, { taxable: number; tax: number }>();
  for (const it of items) {
    const amt = lineAmount(it);
    const tax = (amt * it.gstRate) / 100;
    const e = merged.get(it.gstRate) ?? { taxable: 0, tax: 0 };
    e.taxable += amt;
    e.tax += tax;
    merged.set(it.gstRate, e);
  }
  const sorted = [...merged.entries()].sort((a, b) => a[0] - b[0]);

  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
        {title}
      </p>
      <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
        <thead className="bg-slate-50">
          <tr>
            <th className="text-left text-xs font-medium text-slate-500 px-3 py-2">Rate</th>
            <th className="text-right text-xs font-medium text-slate-500 px-3 py-2">Taxable</th>
            {type === "igst" ? (
              <th className="text-right text-xs font-medium text-slate-500 px-3 py-2">IGST</th>
            ) : (
              <>
                <th className="text-right text-xs font-medium text-slate-500 px-3 py-2">CGST</th>
                <th className="text-right text-xs font-medium text-slate-500 px-3 py-2">SGST</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {sorted.map(([rate, v]) => (
            <tr key={rate} className="border-t border-slate-100">
              <td className="px-3 py-2 text-slate-600">{rate}%</td>
              <td className="px-3 py-2 text-right text-slate-600">{formatMoney(v.taxable, currency)}</td>
              {type === "igst" ? (
                <td className="px-3 py-2 text-right text-slate-600">{formatMoney(v.tax, currency)}</td>
              ) : (
                <>
                  <td className="px-3 py-2 text-right text-slate-600">{formatMoney(v.tax / 2, currency)}</td>
                  <td className="px-3 py-2 text-right text-slate-600">{formatMoney(v.tax / 2, currency)}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
