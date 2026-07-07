import jsPDF from "jspdf";
import type { Invoice, Profile } from "./types";
import { formatDate } from "./constants";
import { lineAmount } from "./gst";
import { getCurrencySymbol, getCurrencyDecimals, convertCurrency } from "./currency";

// Computed once in InvoicePreview.tsx and passed in here, so the PDF NEVER
// recalculates currency/tax independently — it only renders numbers and
// legal fields that were already shown on screen, all sourced from the
// LOCKED invoice record (Profile is only used here for header display
// items like logo/business name/phone/email, never for legal data).
// This is what guarantees "PDF == Preview".
export interface InvoicePDFExtras {
  // ── Locked legal snapshot (invoice fields only, Profile fallback only
  // happens upstream in InvoicePreview.tsx for legacy invoices) ────────────
  businessCountry: string;
  businessState: string | null;
  businessCurrency: string;
  clientCountry: string;

  invoiceCurrency: string;
  baseCurrency: string;
  exchangeRate: number;
  isForeignCurrency: boolean;
  displaySubtotal: number;
  displayCgst: number;
  displaySgst: number;
  displayIgst: number;
  displayTotal: number;
  baseTotal: number;
  taxLabel: string;
  taxNote: string;
  isInterState: boolean;
  isZeroRated: boolean;
  // Country-aware labels for the GSTIN/HSN-style fields (see comment at the
  // call site in InvoicePreview.tsx for why these are needed).
  businessTaxLabel: string;
  clientTaxLabel: string;
  isIndiaLineItemLabels: boolean;
}

// jsPDF's built-in helvetica font does not render the ₹ glyph reliably,
// so INR keeps the existing "Rs." text workaround. Other currencies use
// their standard symbol (all plain ASCII/Latin-1, safe for helvetica).
function pdfMoney(value: number, currency: string): string {
  const symbol = currency === "INR" ? "Rs. " : getCurrencySymbol(currency);
  const decimals = getCurrencyDecimals(currency);
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
  return `${symbol}${formatted}`;
}

export function generateInvoicePDF(
  invoice: Invoice,
  profile: Profile,
  extras: InvoicePDFExtras
): void {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = margin;

  const primary: [number, number, number] = [37, 99, 235];
  const dark: [number, number, number] = [15, 23, 42];
  const gray: [number, number, number] = [100, 116, 139];
  const lightGray: [number, number, number] = [241, 245, 249];

  if (profile.logo_url) {
    try {
      doc.addImage(profile.logo_url, "PNG", margin, y, 60, 60);
    } catch {
      // logo may be jpg or unsupported; skip silently
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...dark);
  doc.text(profile.business_name || "Your Business", margin + 72, y + 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...gray);
  let addrY = y + 34;
  if (profile.address) {
    const addrLines = doc.splitTextToSize(profile.address, 220);
    doc.text(addrLines, margin + 72, addrY);
    addrY += addrLines.length * 12;
  }
  // ── Locked business country/state (invoice snapshot, not live Profile) ──
  const businessLocation = extras.businessState
    ? `${extras.businessState}, ${extras.businessCountry}`
    : extras.businessCountry;
  doc.text(businessLocation, margin + 72, addrY);
  addrY += 12;
  if (profile.gstin) {
    doc.text(`${extras.businessTaxLabel}: ${profile.gstin}`, margin + 72, addrY);
    addrY += 12;
  }
  if (profile.phone) {
    doc.text(`Phone: ${profile.phone}`, margin + 72, addrY);
    addrY += 12;
  }
  if (profile.email) {
    doc.text(`Email: ${profile.email}`, margin + 72, addrY);
  }

  const badgeW = 90;
  const badgeH = 26;
  const badgeX = pageWidth - margin - badgeW;
  doc.setFillColor(...primary);
  doc.roundedRect(badgeX, y, badgeW, badgeH, 4, 4, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text("INVOICE", badgeX + badgeW / 2, y + 17, { align: "center" });

  doc.setFontSize(11);
  doc.setTextColor(...dark);
  doc.text(invoice.invoice_number, pageWidth - margin, y + badgeH + 18, {
    align: "right",
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...gray);
  doc.text(
    `Invoice Date: ${formatDate(invoice.invoice_date)}`,
    pageWidth - margin,
    y + badgeH + 34,
    { align: "right" }
  );
  doc.text(
    `Due Date: ${formatDate(invoice.due_date)}`,
    pageWidth - margin,
    y + badgeH + 48,
    { align: "right" }
  );

  y += Math.max(addrY - margin, badgeH + 60) + 24;

  doc.setDrawColor(...lightGray);
  doc.setLineWidth(1);
  doc.line(margin, y, pageWidth - margin, y);
  y += 16;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...gray);
  doc.text("BILL TO", margin, y);
  y += 16;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...dark);
  doc.text(invoice.client_name, margin, y);
  y += 14;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...gray);
  if (invoice.client_gstin) {
    doc.text(`${extras.clientTaxLabel}: ${invoice.client_gstin}`, margin, y);
    y += 12;
  }
  if (invoice.client_address) {
    const addrLines = doc.splitTextToSize(invoice.client_address, 240);
    doc.text(addrLines, margin, y);
    y += addrLines.length * 12;
  }
  if (invoice.client_state) {
    doc.text(invoice.client_state, margin, y);
    y += 12;
  }
  // ── Locked client country (invoice.client_country, no Clients lookup) ───
  doc.text(extras.clientCountry, margin, y);
  y += 12;
  if (invoice.client_phone) {
    doc.text(`Phone: ${invoice.client_phone}`, margin, y);
    y += 12;
  }
  if (invoice.client_email) {
    doc.text(`Email: ${invoice.client_email}`, margin, y);
    y += 12;
  }

  y += 6;

  // ── Currency, exchange rate & tax basis line ─────────────────────────────
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...gray);
  doc.text(
    `Invoice Currency: ${extras.invoiceCurrency}   Base Currency: ${extras.baseCurrency}   Tax Basis: ${extras.taxLabel}`,
    margin,
    y
  );
  y += 12;
  if (extras.isForeignCurrency) {
    doc.text(
      `Exchange Rate: 1 ${extras.invoiceCurrency} = ${pdfMoney(1 / extras.exchangeRate, extras.baseCurrency)}`,
      margin,
      y
    );
    y += 12;
  }

  y += 10;

  const tableX = margin;
  const tableW = pageWidth - margin * 2;
  const colDesc = tableW * 0.32;
  const colHsn = tableW * 0.12;
  const colQty = tableW * 0.1;
  const colRate = tableW * 0.16;

  doc.setFillColor(...primary);
  doc.rect(tableX, y, tableW, 24, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text("Description", tableX + 8, y + 16);
  doc.text(extras.isIndiaLineItemLabels ? "HSN/SAC" : "Tax Code", tableX + colDesc + 8, y + 16);
  doc.text("Qty", tableX + colDesc + colHsn + 8, y + 16);
  doc.text("Rate", tableX + colDesc + colHsn + colQty + 8, y + 16);
  doc.text(extras.isIndiaLineItemLabels ? "GST" : "Tax %", tableX + colDesc + colHsn + colQty + colRate + 8, y + 16);
  doc.text("Amount", tableX + tableW - 8, y + 16, { align: "right" });
  y += 24;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...dark);
  let rowIdx = 0;
  for (const item of invoice.items) {
    const rowH = 22;
    if (rowIdx % 2 === 1) {
      doc.setFillColor(...lightGray);
      doc.rect(tableX, y, tableW, rowH, "F");
    }
    const descLines = doc.splitTextToSize(item.description || "", colDesc - 16);
    doc.text(descLines[0] || "", tableX + 8, y + 14);
    doc.text(item.hsnSac || "—", tableX + colDesc + 8, y + 14);
    doc.text(String(item.qty), tableX + colDesc + colHsn + 8, y + 14);
    doc.text(pdfMoney(item.rate, extras.invoiceCurrency), tableX + colDesc + colHsn + colQty + 8, y + 14);
    doc.text(`${item.gstRate}%`, tableX + colDesc + colHsn + colQty + colRate + 8, y + 14);
    const rawAmount = lineAmount(item);
    // Routed through convertCurrency (same helper Preview uses) instead of a
    // raw multiply, so PDF line amounts match Preview exactly, rounding
    // included.
    const displayAmount = extras.isForeignCurrency
      ? convertCurrency(rawAmount, extras.exchangeRate)
      : rawAmount;
    doc.text(
      pdfMoney(displayAmount, extras.invoiceCurrency),
      tableX + tableW - 8,
      y + 14,
      { align: "right" }
    );
    y += rowH;
    rowIdx++;
  }

  doc.setDrawColor(...lightGray);
  doc.line(tableX, y, tableX + tableW, y);
  y += 16;

  const totalsX = tableX + tableW * 0.55;
  const labelX = totalsX;
  const valueX = tableX + tableW;
  const rowGap = 18;

  function totalRow(label: string, value: string, bold = false) {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 11 : 9);
    doc.setTextColor(...(bold ? dark : gray));
    doc.text(label, labelX, y);
    doc.text(value, valueX, y, { align: "right" });
    y += rowGap;
  }

  totalRow("Subtotal", pdfMoney(extras.displaySubtotal, extras.invoiceCurrency));

  if (extras.isInterState) {
    totalRow(extras.taxLabel, pdfMoney(extras.displayIgst, extras.invoiceCurrency));
  } else if (extras.isZeroRated) {
    totalRow(extras.taxLabel, "—");
  } else {
    if (extras.displayCgst > 0) totalRow("CGST", pdfMoney(extras.displayCgst, extras.invoiceCurrency));
    if (extras.displaySgst > 0) totalRow("SGST", pdfMoney(extras.displaySgst, extras.invoiceCurrency));
  }

  y += 4;
  doc.setDrawColor(...primary);
  doc.setLineWidth(1.5);
  doc.line(labelX, y, valueX, y);
  y += 16;

  doc.setFillColor(...primary);
  doc.roundedRect(labelX - 8, y - 14, valueX - labelX + 16, 30, 4, 4, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text("Grand Total", labelX, y + 5);
  doc.text(pdfMoney(extras.displayTotal, extras.invoiceCurrency), valueX - 8, y + 5, { align: "right" });
  y += 32;

  if (extras.isForeignCurrency) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...gray);
    doc.text(
      `~ ${pdfMoney(extras.baseTotal, extras.baseCurrency)} (Base Currency Equivalent)`,
      valueX,
      y,
      { align: "right" }
    );
    y += 16;
  }

  // ── Tax note ──────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(...gray);
  const taxNoteLines = doc.splitTextToSize(extras.taxNote, tableW);
  doc.text(taxNoteLines, margin, y);
  y += taxNoteLines.length * 11 + 12;

  if (invoice.notes) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...gray);
    doc.text("Notes:", margin, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    const noteLines = doc.splitTextToSize(invoice.notes, tableW);
    doc.text(noteLines, margin, y);
    y += noteLines.length * 12 + 8;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...primary);
  doc.text("Thank you for your business!", pageWidth / 2, pageHeight - 50, {
    align: "center",
  });

  if (!profile.is_pro) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...gray);
    doc.text("Created with InvoiceKit", pageWidth / 2, pageHeight - 32, {
      align: "center",
    });
  }

  const safeClient = invoice.client_name.replace(/[^a-zA-Z0-9]/g, "") || "Client";
  const filename = `${invoice.invoice_number}-${safeClient}.pdf`;
  doc.save(filename);
}