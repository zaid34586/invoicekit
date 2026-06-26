import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import type { Invoice, InvoiceStatus } from "../lib/types";
import { formatINR, formatDate } from "../lib/constants";
import { lineAmount } from "../lib/gst";
import { generateInvoicePDF } from "../lib/pdf";
import { buildWhatsAppLink } from "../lib/whatsapp";
import StatusBadge from "../components/StatusBadge";

const STATUS_OPTIONS: { value: InvoiceStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
];

export default function InvoicePreview() {
  const { id } = useParams<{ id: string }>();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  useEffect(() => {
    async function load() {
      if (!id || !user) return;
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!error && data) {
        setInvoice(data as Invoice);
      }
      setLoading(false);
    }
    load();
  }, [id, user]);

  async function updateStatus(newStatus: InvoiceStatus) {
    if (!invoice || !user) return;
    setUpdating(true);
    const { data, error } = await supabase
      .from("invoices")
      .update({ status: newStatus })
      .eq("id", invoice.id)
      .select("*")
      .single();
    setUpdating(false);
    if (!error && data) {
      setInvoice(data as Invoice);
    }
  }

  async function toggleShareLink() {
    if (!invoice || !user) return;
    setUpdating(true);
    const newToken = invoice.share_token
      ? null
      : crypto.randomUUID();
    const { data, error } = await supabase
      .from("invoices")
      .update({ share_token: newToken })
      .eq("id", invoice.id)
      .select("*")
      .single();
    setUpdating(false);
    if (!error && data) {
      setInvoice(data as Invoice);
    }
  }

  function copyShareLink() {
    if (!invoice?.share_token) return;
    const url = `${window.location.origin}/share/${invoice.share_token}`;
    navigator.clipboard.writeText(url);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  }

  async function handleDelete() {
    if (!invoice || !user) return;
    if (!confirm(`Delete invoice ${invoice.invoice_number}? This cannot be undone.`)) {
      return;
    }
    const { error } = await supabase
      .from("invoices")
      .delete()
      .eq("id", invoice.id);
    if (!error) {
      navigate("/invoices");
    }
  }

  function handleDownloadPDF() {
    if (!invoice || !profile) return;
    generateInvoicePDF(invoice, profile);
  }

  function handleWhatsApp() {
    if (!invoice || !profile) return;
    window.open(buildWhatsAppLink(invoice, profile), "_blank");
  }

  function handleEmail() {
    if (!invoice || !profile) return;
    const subject = `Invoice ${invoice.invoice_number} from ${profile.business_name || "InvoiceKit"}`;
    const body =
      `Hello ${invoice.client_name},\n\n` +
      `Please find your invoice details below:\n\n` +
      `Invoice Number: ${invoice.invoice_number}\n` +
      `Invoice Date: ${formatDate(invoice.invoice_date)}\n` +
      `Due Date: ${formatDate(invoice.due_date)}\n` +
      `Amount: ${formatINR(Number(invoice.total))}\n\n` +
      (invoice.share_token
        ? `View invoice online: ${window.location.origin}/share/${invoice.share_token}\n\n`
        : "") +
      `Thank you for your business!\n\n` +
      `${profile.business_name || ""}\n${profile.phone || ""} ${profile.email || ""}`.trim();
    const mailto = `mailto:${invoice.client_email || ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
    setEmailSent(true);
    setTimeout(() => setEmailSent(false), 2000);
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-12 text-center text-sm text-slate-500">
        Loading invoice...
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="max-w-4xl mx-auto py-12 text-center">
        <p className="text-slate-500 mb-4">Invoice not found.</p>
        <Link to="/invoices" className="btn-primary">
          Back to invoices
        </Link>
      </div>
    );
  }

  const isInterState = invoice.igst > 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/invoices" className="btn-ghost text-sm">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back
        </Link>
        <div className="flex-1" />
        <button onClick={handleDownloadPDF} className="btn-primary">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download PDF
        </button>
        <button onClick={handleWhatsApp} className="btn-secondary">
          <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
          WhatsApp
        </button>
        <button onClick={handleEmail} className="btn-secondary">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          {emailSent ? "Opening..." : "Email"}
        </button>
        <button
          onClick={toggleShareLink}
          disabled={updating}
          className="btn-secondary"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          {invoice.share_token ? "Unshare" : "Share"}
        </button>
        <button onClick={handleDelete} className="btn-danger">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Delete
        </button>
      </div>

      {invoice.share_token && (
        <div className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-700">Public share link</p>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {window.location.origin}/share/{invoice.share_token}
            </p>
          </div>
          <button onClick={copyShareLink} className="btn-secondary text-sm whitespace-nowrap">
            {shareCopied ? "Copied!" : "Copy link"}
          </button>
        </div>
      )}

      <div className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-slate-700">Status:</span>
          <StatusBadge status={invoice.status} />
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-500">Change:</label>
          <select
            value={invoice.status}
            onChange={(e) => updateStatus(e.target.value as InvoiceStatus)}
            disabled={updating}
            className="input text-sm py-1.5 w-auto"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
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
                {profile?.business_name || "Your Business"}
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
            <div className="mt-2">
              <StatusBadge status={invoice.status} />
            </div>
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
                      {formatINR(item.rate)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700 text-center">
                      {item.gstRate}%
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900 text-right">
                      {formatINR(lineAmount(item))}
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
              <GSTBreakupTable
                title="IGST Breakup"
                rows={invoice.items.map((it) => ({
                  rate: it.gstRate,
                  taxable: lineAmount(it),
                  tax: (lineAmount(it) * it.gstRate) / 100,
                }))}
                type="igst"
              />
            ) : invoice.cgst > 0 || invoice.sgst > 0 ? (
              <GSTBreakupTable
                title="CGST + SGST Breakup"
                rows={invoice.items.map((it) => ({
                  rate: it.gstRate,
                  taxable: lineAmount(it),
                  tax: (lineAmount(it) * it.gstRate) / 100,
                }))}
                type="cgstsgst"
              />
            ) : null}
          </div>

          <div className="sm:w-64 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Subtotal</span>
              <span className="font-medium text-slate-900">
                {formatINR(Number(invoice.subtotal))}
              </span>
            </div>
            {isInterState ? (
              <div className="flex justify-between">
                <span className="text-slate-500">IGST</span>
                <span className="font-medium text-slate-900">
                  {formatINR(Number(invoice.igst))}
                </span>
              </div>
            ) : (
              <>
                <div className="flex justify-between">
                  <span className="text-slate-500">CGST</span>
                  <span className="font-medium text-slate-900">
                    {formatINR(Number(invoice.cgst))}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">SGST</span>
                  <span className="font-medium text-slate-900">
                    {formatINR(Number(invoice.sgst))}
                  </span>
                </div>
              </>
            )}
            <div className="bg-primary-600 text-white rounded-lg px-4 py-3 flex justify-between items-center mt-3">
              <span className="font-semibold">Grand Total</span>
              <span className="text-lg font-bold">
                {formatINR(Number(invoice.total))}
              </span>
            </div>

            {invoice.status !== "paid" && invoice.status !== "draft" && (
              <button
                onClick={() => setShowPayModal(true)}
                className="w-full mt-3 bg-green-600 text-white font-semibold rounded-lg px-4 py-2.5 hover:bg-green-700 transition active:scale-[0.98]"
              >
                Pay Invoice
              </button>
            )}
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
              Created with InvoiceKit
            </p>
          )}
        </div>
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
              Amount due: {formatINR(Number(invoice.total))}
            </p>
            <p className="text-sm text-amber-600 font-medium mt-4">
              Payment gateway coming soon
            </p>
            <button
              onClick={() => setShowPayModal(false)}
              className="btn-secondary w-full mt-6"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function GSTBreakupTable({
  title,
  rows,
  type,
}: {
  title: string;
  rows: { rate: number; taxable: number; tax: number }[];
  type: "igst" | "cgstsgst";
}) {
  const merged = new Map<number, { taxable: number; tax: number }>();
  for (const r of rows) {
    const e = merged.get(r.rate) ?? { taxable: 0, tax: 0 };
    e.taxable += r.taxable;
    e.tax += r.tax;
    merged.set(r.rate, e);
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
            <th className="text-left text-xs font-medium text-slate-500 px-3 py-2">
              Rate
            </th>
            <th className="text-right text-xs font-medium text-slate-500 px-3 py-2">
              Taxable
            </th>
            {type === "igst" ? (
              <th className="text-right text-xs font-medium text-slate-500 px-3 py-2">
                IGST
              </th>
            ) : (
              <>
                <th className="text-right text-xs font-medium text-slate-500 px-3 py-2">
                  CGST
                </th>
                <th className="text-right text-xs font-medium text-slate-500 px-3 py-2">
                  SGST
                </th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {sorted.map(([rate, v]) => (
            <tr key={rate} className="border-t border-slate-100">
              <td className="px-3 py-2 text-slate-600">{rate}%</td>
              <td className="px-3 py-2 text-right text-slate-600">
                {formatINR(v.taxable)}
              </td>
              {type === "igst" ? (
                <td className="px-3 py-2 text-right text-slate-600">
                  {formatINR(v.tax)}
                </td>
              ) : (
                <>
                  <td className="px-3 py-2 text-right text-slate-600">
                    {formatINR(v.tax / 2)}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-600">
                    {formatINR(v.tax / 2)}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
