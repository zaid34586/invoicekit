import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import type { Invoice, InvoiceStatus } from "../lib/types";
import { formatDate, getCountryFlag } from "../lib/constants";
import { lineAmount } from "../lib/gst";
import { generateInvoicePDF, type InvoicePDFExtras } from "../lib/pdf";
import { buildWhatsAppLink } from "../lib/whatsapp";
import StatusBadge from "../components/StatusBadge";
import { decideTax, type TaxDecision } from "../lib/tax";
import { formatMoney, convertCurrency } from "../lib/currency";
import { getTaxLabel } from "../lib/international";
import { DEFAULT_BRANDING, brandingFont, type WorkspaceBranding } from "../lib/branding";

const STATUS_OPTIONS: { value: InvoiceStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
];

export default function InvoicePreview() {
  const { id } = useParams<{ id: string }>();
  const { user, profile, workspaceOwnerId } = useAuth();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [branding, setBranding] = useState<WorkspaceBranding | null>(null);

  useEffect(() => {
    async function load() {
      if (!id || !user) return;
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", id)
        .eq("user_id", workspaceOwnerId || user.id)
        .maybeSingle();
      if (!error && data) {
        setInvoice(data as Invoice);
      }
      if (profile?.plan === "business") {
        const { data: workspace } = await supabase.from("workspaces").select("id").eq("owner_user_id", profile.user_id).maybeSingle();
        if (workspace?.id) {
          const { data: brand } = await supabase.from("workspace_branding").select("*").eq("workspace_id",workspace.id).maybeSingle();
          if (brand) setBranding({ ...DEFAULT_BRANDING, ...brand } as WorkspaceBranding);
        }
      }
      setLoading(false);
    }
    load();
  }, [id, user, workspaceOwnerId, profile?.plan, profile?.user_id]);

  async function updateStatus(newStatus: InvoiceStatus) {
    if (!invoice || !user) return;

    setUpdating(true);

    const { data, error } = await supabase
      .from("invoices")
      .update({ status: newStatus })
      .eq("id", invoice.id)
      .eq("user_id", workspaceOwnerId || user.id)
      .select("*")
      .single();

    setUpdating(false);

    if (error) {
      alert(error.message);
      return;
    }

    if (data) {
      setInvoice(data as Invoice);
    }
  }

  async function handleShare() {
    if (!invoice) return;

    let token = invoice.share_token;

    if (!token) {
      if (!user) return;

      setUpdating(true);

      const newToken = crypto.randomUUID();

      const { data, error } = await supabase
        .from("invoices")
        .update({ share_token: newToken })
        .eq("id", invoice.id)
        .select("*")
        .single();

      setUpdating(false);

      if (error || !data) return;

      setInvoice(data as Invoice);

      token = newToken;
    }

    const url = `${window.location.origin}/share/${token}`;

    if (navigator.share) {
      await navigator.share({
        title: invoice.invoice_number,
        text: `Invoice ${invoice.invoice_number}`,
        url,
      });
    } else {
      await navigator.clipboard.writeText(url);
      alert("Share link copied.");
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

  async function handleDownloadPDF() {
    if (!invoice || !profile) return;
    const extras: InvoicePDFExtras = {
      businessCountry,
      businessState,
      businessCurrency,
      clientCountry,
      invoiceCurrency,
      baseCurrency,
      exchangeRate,
      exchangeRateDate: invoice.exchange_rate_date,
      isForeignCurrency,
      displaySubtotal,
      displayCgst,
      displaySgst,
      displayIgst,
      displayTotal,
      baseTotal: baseTotalDisplay,
      taxLabel: effectiveTaxLabel,
      taxNote: effectiveTaxNote,
      isInterState,
      isZeroRated: effectiveIsZeroRated,
      businessTaxLabel,
      clientTaxLabel,
      isIndiaLineItemLabels,
    };
    await generateInvoicePDF(invoice, profile, extras, branding);
  }

  function handleWhatsApp() {
    if (!invoice || !profile) return;
    window.open(buildWhatsAppLink(invoice, profile), "_blank");
  }

  function handleEmail() {
    if (!invoice || !profile) return;
    const subject = `Invoice ${invoice.invoice_number} from ${profile.business_name || "Rivox"}`;
    const body =
      `Hello ${invoice.client_name},\n\n` +
      `Please find your invoice details below:\n\n` +
      `Invoice Number: ${invoice.invoice_number}\n` +
      `Invoice Date: ${formatDate(invoice.invoice_date)}\n` +
      `Due Date: ${formatDate(invoice.due_date)}\n` +
      `Amount: ${formatMoney(displayTotal, invoiceCurrency)}\n\n` +
      (invoice.share_token
        ? `View invoice online: ${window.location.origin}/share/${invoice.share_token}\n\n`
        : "") +
      `Thank you for your business!\n\n` +
      `${profile.business_name || ""}\n${profile.phone || ""} ${profile.email || ""}`.trim();
    const gmailUrl =
      `https://mail.google.com/mail/?view=cm&fs=1` +
      `&to=${encodeURIComponent(invoice.client_email || "")}` +
      `&su=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(body)}`;

    window.open(gmailUrl, "_blank");
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

  // ── Business legal data: LOCKED invoice fields only. Profile is used ONLY
  // as a fallback for invoices created before the data-model upgrade (where
  // business_country/business_state/business_currency are null). Never used
  // for invoices that already have this snapshot. ───────────────────────────
  const isLegacyBusinessInfo = invoice.business_country == null;
  const businessCountry =
  invoice.business_country ??
  profile?.country ??
  "United States";
  const businessState = invoice.business_state ?? profile?.state ?? null;
  const businessCurrency =
  invoice.business_currency ??
  invoice.base_currency ??
  profile?.currency ??
  "USD";

  // ── Client legal data: LOCKED invoice field only. NO Clients table lookup.
  // Old invoices (pre-upgrade) simply have no reliable client country — we do
  // not guess it, since falling back to Profile or a table lookup could show
  // a country the client did not actually have at invoice time. ────────────
  const isLegacyClientCountry = invoice.client_country == null;
  const clientCountry = invoice.client_country ?? "Not recorded (legacy invoice)";

  // ── Tax-ID / HSN labelling: these are country-specific concepts (GSTIN,
  // HSN/SAC, and the "GST" rate column only really make sense for India).
  // Elsewhere (US, UK, Germany, etc.) the same underlying fields are used
  // generically as "Tax ID"/"VAT Number"/etc and "Tax Code" — this mirrors
  // the labelling used in the New Invoice form so a saved invoice matches
  // what was shown while creating it.
  const businessTaxLabel = getTaxLabel(businessCountry);
  const clientTaxLabel = getTaxLabel(clientCountry);
  const isIndiaLineItemLabels = businessCountry === "India";

  // ── Currency: base/invoice currency come from the LOCKED invoice snapshot.
  // Profile is only a fallback for legacy invoices missing base_currency. ───
  const baseCurrency =
  invoice.base_currency ??
  profile?.currency ??
  "USD";
  const invoiceCurrency = invoice.invoice_currency ?? baseCurrency;
  const isForeignCurrency = invoiceCurrency !== baseCurrency;
  const exchangeRate = invoice.exchange_rate ?? 1;

  // Item rates are stored in invoice currency. The item sum is therefore the
  // authoritative invoice-currency subtotal. This also self-repairs display
  // for older foreign-currency invoices whose snapshot was accidentally
  // multiplied by the exchange rate twice.
  const itemSubtotal = invoice.items.reduce(
    (sum, item) => sum + lineAmount(item),
    0
  );

  const storedInvoiceSubtotal =
    invoice.invoice_subtotal ??
    (isForeignCurrency
      ? convertCurrency(Number(invoice.subtotal), exchangeRate)
      : Number(invoice.subtotal));

  const subtotalMismatch =
    Math.abs(storedInvoiceSubtotal - itemSubtotal) >
    Math.max(0.01, Math.abs(itemSubtotal) * 0.001);

  const displaySubtotal = subtotalMismatch
    ? itemSubtotal
    : storedInvoiceSubtotal;

  // Tax columns remain stored in base currency, so convert them once for
  // invoice display. Never convert item rates or item amounts.
  const displayCgst = isForeignCurrency
    ? convertCurrency(Number(invoice.cgst), exchangeRate)
    : Number(invoice.cgst);
  const displaySgst = isForeignCurrency
    ? convertCurrency(Number(invoice.sgst), exchangeRate)
    : Number(invoice.sgst);
  const displayIgst = isForeignCurrency
    ? convertCurrency(Number(invoice.igst), exchangeRate)
    : Number(invoice.igst);

  const displayTotal =
    displaySubtotal + displayCgst + displaySgst + displayIgst;

  const baseTotalDisplay =
    isForeignCurrency && exchangeRate > 0
      ? Math.round((displayTotal / exchangeRate) * 100) / 100
      : displayTotal;

  // ── Tax: use the LOCKED tax_label/tax_note/tax_type from the invoice row.
  // decideTax() is invoked ONLY as a fallback for legacy invoices that were
  // created before tax data was snapshotted onto the invoice. Even in that
  // fallback path, business_country/business_state prefer the invoice's own
  // (possibly null) fields before touching Profile. ────────────────────────
  const isLegacyTaxInfo = invoice.tax_label == null || invoice.tax_note == null;

  let legacyTaxDecision: TaxDecision | null = null;
  if (isLegacyTaxInfo) {
    legacyTaxDecision = decideTax({
      businessCountry: invoice.business_country ?? profile?.country ?? "India",
      businessState: invoice.business_state ?? profile?.state ?? null,
      clientCountry:
invoice.client_country ?? "United States",
      clientState: invoice.client_state,
      defaultGstRate: invoice.items[0]?.gstRate ?? 18,
    });
  }

  const effectiveTaxLabel = invoice.tax_label ?? legacyTaxDecision!.taxLabel;
  const effectiveTaxNote = invoice.tax_note ?? legacyTaxDecision!.taxNote;
  const effectiveIsZeroRated = invoice.tax_type
    ? invoice.tax_type === "export_zero_rated" || invoice.tax_type === "international_exempt"
    : legacyTaxDecision!.isZeroRated;

  const isLegacyInvoice = isLegacyBusinessInfo || isLegacyClientCountry || isLegacyTaxInfo;

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
          onClick={handleShare}
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

      {isLegacyInvoice && (
        <div className="card p-3 bg-amber-50 border-amber-200 text-xs text-amber-700">
          This invoice was created before legal-data snapshots were saved on
          invoices. Some fields below (business/client country, state, or tax
          basis) are shown from current account settings and may not exactly
          match what was in effect on the invoice date.
        </div>
      )}

      {/* ── Locked invoice legal & currency details ───────────────────────── */}
      <div className="card p-4 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
        <div>
          <span className="text-slate-500 block text-xs uppercase tracking-wide">Business Country</span>
          <span className="font-medium text-slate-900">{businessCountry}</span>
        </div>
        <div>
          <span className="text-slate-500 block text-xs uppercase tracking-wide">Business State</span>
          <span className="font-medium text-slate-900">{businessState || "—"}</span>
        </div>
        <div>
          <span className="text-slate-500 block text-xs uppercase tracking-wide">Business Currency</span>
          <span className="font-medium text-slate-900">{businessCurrency}</span>
        </div>
        <div>
          <span className="text-slate-500 block text-xs uppercase tracking-wide">Client Country</span>
          <span className="font-medium text-slate-900">{clientCountry}</span>
        </div>
        <div>
          <span className="text-slate-500 block text-xs uppercase tracking-wide">Client State</span>
          <span className="font-medium text-slate-900">{invoice.client_state || "—"}</span>
        </div>
        <div>
          <span className="text-slate-500 block text-xs uppercase tracking-wide">Tax Basis</span>
          <span className="font-medium text-slate-900">{effectiveTaxLabel}</span>
        </div>
        <div>
          <span className="text-slate-500 block text-xs uppercase tracking-wide">Invoice Currency</span>
          <span className="font-medium text-slate-900">{invoiceCurrency} {getCountryFlag(clientCountry)}</span>
        </div>
        <div>
          <span className="text-slate-500 block text-xs uppercase tracking-wide">Base Currency</span>
          <span className="font-medium text-slate-900">{baseCurrency} {getCountryFlag(businessCountry)}</span>
        </div>
        {isForeignCurrency && (
          <div>
            <span className="text-slate-500 block text-xs uppercase tracking-wide">Exchange Rate</span>
            <span className="font-medium text-slate-900">
              1 {baseCurrency} = {formatMoney(exchangeRate, invoiceCurrency)}
            </span>
          </div>
        )}
        {isForeignCurrency && invoice.exchange_rate_date && (
          <div>
            <span className="text-slate-500 block text-xs uppercase tracking-wide">Rate Date</span>
            <span className="font-medium text-slate-900">
              {formatDate(invoice.exchange_rate_date)}
            </span>
          </div>
        )}
      </div>

      <div className={`card overflow-hidden p-6 sm:p-10 ${branding?.pdf_template==="luxury"?"border-amber-300 bg-[#fffdf7]":branding?.pdf_template==="minimal"?"rounded-none shadow-none":branding?.pdf_template==="corporate"?"border-t-[10px] border-t-blue-700":""}`} style={{fontFamily:branding?brandingFont(branding.font_family):undefined}}>
        <div className={`flex flex-col sm:flex-row sm:justify-between gap-6 pb-6 border-b border-slate-200 ${branding?.pdf_template==="luxury"?"-mx-6 -mt-6 bg-stone-950 p-6 text-amber-50 sm:-mx-10 sm:-mt-10 sm:p-10 [&_h1]:!text-amber-50 [&_p]:!text-amber-100/70":branding?.pdf_template==="executive"?"-mx-6 -mt-6 bg-slate-950 p-6 text-white sm:-mx-10 sm:-mt-10 sm:p-10 [&_h1]:!text-white [&_p]:!text-slate-300":branding?.pdf_template==="modern"?"rounded-2xl bg-gradient-to-r from-violet-50 to-indigo-50 p-5":""}`}>
          <div className="flex items-start gap-4">
            {(branding?.logo_url||profile?.logo_url) ? (
              <img
                src={branding?.logo_url||profile?.logo_url||""}
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
              <p className="text-sm text-slate-500 mt-1">
                {businessState ? `${businessState}, ` : ""}
                {businessCountry}
              </p>
              {profile?.gstin && (
                <p className="text-sm text-slate-500 mt-1">
                  {businessTaxLabel}: {profile.gstin}
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
            <span className="inline-block text-white px-4 py-1.5 rounded-lg text-sm font-bold tracking-wide" style={{backgroundColor:branding?.brand_color||"#4f46e5"}}>
              {branding?.invoice_title||"INVOICE"}
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
              {clientTaxLabel}: {invoice.client_gstin}
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
          <p className="text-sm text-slate-500">{clientCountry}</p>
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
                <tr className="text-white" style={{backgroundColor:branding?.brand_color||"#4f46e5"}}>
                  <th className="text-left text-xs font-semibold uppercase tracking-wide px-4 py-3 rounded-l-lg">
                    Description
                  </th>
                  <th className="text-center text-xs font-semibold uppercase tracking-wide px-4 py-3">
                    {isIndiaLineItemLabels ? "HSN/SAC" : "Tax Code"}
                  </th>
                  <th className="text-center text-xs font-semibold uppercase tracking-wide px-4 py-3">
                    Qty
                  </th>
                  <th className="text-right text-xs font-semibold uppercase tracking-wide px-4 py-3">
                    Rate
                  </th>
                  <th className="text-center text-xs font-semibold uppercase tracking-wide px-4 py-3">
                    {isIndiaLineItemLabels ? "GST" : "Tax %"}
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
            {(isInterState || invoice.cgst > 0 || invoice.sgst > 0) &&
              (isInterState ? (
                <GSTBreakupTable
                  title={`${effectiveTaxLabel} Breakup`}
                  currency={invoiceCurrency}
                  rows={invoice.items.map((it) => {
                    const rawTaxable = lineAmount(it);
                    const rawTax = (rawTaxable * it.gstRate) / 100;
                    return {
                      rate: it.gstRate,
                      taxable: rawTaxable,
                      tax: rawTax,
                    };
                  })}
                  type="igst"
                  taxLabel={businessCountry === "India" ? "IGST" : effectiveTaxLabel}
                />
              ) : (
                <GSTBreakupTable
                  title={`${effectiveTaxLabel} Breakup`}
                  currency={invoiceCurrency}
                  rows={invoice.items.map((it) => {
                    const rawTaxable = lineAmount(it);
                    const rawTax = (rawTaxable * it.gstRate) / 100;
                    return {
                      rate: it.gstRate,
                      taxable: rawTaxable,
                      tax: rawTax,
                    };
                  })}
                  type="cgstsgst"
                />
              ))}
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
                <span className="text-slate-500">{effectiveTaxLabel}</span>
                <span className="font-medium text-slate-900">
                  {formatMoney(displayIgst, invoiceCurrency)}
                </span>
              </div>
            ) : effectiveIsZeroRated ? (
              <div className="flex justify-between">
                <span className="text-slate-500">{effectiveTaxLabel}</span>
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
            <div className="bg-primary-600 text-white rounded-lg px-4 py-3 flex justify-between items-center mt-3">
              <span className="font-semibold">Grand Total</span>
              <span className="text-lg font-bold">
                {formatMoney(displayTotal, invoiceCurrency)}
              </span>
            </div>

            {isForeignCurrency && (
              <p className="text-xs text-slate-400 text-right">
                ≈ {formatMoney(baseTotalDisplay, baseCurrency)} (Base Currency Equivalent)
              </p>
            )}

            <p className="text-xs text-slate-400 mt-1">{effectiveTaxNote}</p>

            {invoice.status !== "paid" && invoice.status !== "draft" && (
              <button
                onClick={() => invoice.share_token && window.open(`/share/${invoice.share_token}`, "_blank", "noopener,noreferrer")}
                disabled={!invoice.share_token}
                className="w-full mt-3 bg-green-600 text-white font-semibold rounded-lg px-4 py-2.5 hover:bg-green-700 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {invoice.share_token ? "Preview Client Payment Page" : "Share Invoice to Enable Payments"}
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

        {branding?.payment_instructions&&<div className="py-4 border-t border-slate-200"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Payment instructions</p><p className="mt-1 whitespace-pre-line text-sm text-slate-600">{branding.payment_instructions}</p></div>}
        {branding?.terms_text&&<div className="py-4 border-t border-slate-200"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Terms & conditions</p><p className="mt-1 whitespace-pre-line text-xs text-slate-500">{branding.terms_text}</p></div>}
        {branding&&((branding.show_signature&&branding.signature_url)||(branding.show_stamp&&branding.stamp_url))&&<div className="flex justify-end gap-5 border-t border-slate-200 py-4">{branding.show_signature&&branding.signature_url&&<img src={branding.signature_url} className="h-16 object-contain" alt="Signature"/>}{branding.show_stamp&&branding.stamp_url&&<img src={branding.stamp_url} className="h-16 object-contain" alt="Company stamp"/>}</div>}

        <div className="pt-6 border-t border-slate-200 text-center">
          <p className="text-base font-semibold" style={{color:branding?.accent_color||"#4f46e5"}}>
            {branding?.footer_text||"Thank you for your business!"}
          </p>
          {!branding?.remove_rivox_branding&&!profile?.is_pro && (
            <p className="text-xs text-slate-400 mt-2">
              Created with Rivox
            </p>
          )}
        </div>
      </div>

    </div>
  );
}

function GSTBreakupTable({
  title,
  rows,
  type,
  currency,
  taxLabel = "IGST",
}: {
  title: string;
  rows: { rate: number; taxable: number; tax: number }[];
  type: "igst" | "cgstsgst";
  currency: string;
  taxLabel?: string;
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
                {taxLabel}
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
                {formatMoney(v.taxable, currency)}
              </td>
              {type === "igst" ? (
                <td className="px-3 py-2 text-right text-slate-600">
                  {formatMoney(v.tax, currency)}
                </td>
              ) : (
                <>
                  <td className="px-3 py-2 text-right text-slate-600">
                    {formatMoney(v.tax / 2, currency)}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-600">
                    {formatMoney(v.tax / 2, currency)}
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
