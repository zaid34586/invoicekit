import jsPDF from "jspdf";
import type { Invoice, Profile } from "./types";
import { formatINR, formatDate } from "./constants";
import { lineAmount } from "./gst";

export function generateInvoicePDF(invoice: Invoice, profile: Profile): void {
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
  if (profile.gstin) {
    doc.text(`GSTIN: ${profile.gstin}`, margin + 72, addrY);
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
    doc.text(`GSTIN: ${invoice.client_gstin}`, margin, y);
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
  if (invoice.client_phone) {
    doc.text(`Phone: ${invoice.client_phone}`, margin, y);
    y += 12;
  }
  if (invoice.client_email) {
    doc.text(`Email: ${invoice.client_email}`, margin, y);
    y += 12;
  }

  y += 12;

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
  doc.text("HSN/SAC", tableX + colDesc + 8, y + 16);
  doc.text("Qty", tableX + colDesc + colHsn + 8, y + 16);
  doc.text("Rate", tableX + colDesc + colHsn + colQty + 8, y + 16);
  doc.text("GST", tableX + colDesc + colHsn + colQty + colRate + 8, y + 16);
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
    doc.text(formatINR(item.rate), tableX + colDesc + colHsn + colQty + 8, y + 14);
    doc.text(`${item.gstRate}%`, tableX + colDesc + colHsn + colQty + colRate + 8, y + 14);
    doc.text(
      formatINR(lineAmount(item)),
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

  totalRow("Subtotal", formatINR(invoice.subtotal));
  if (invoice.igst > 0) {
    totalRow("IGST", formatINR(invoice.igst));
  } else {
    if (invoice.cgst > 0) totalRow("CGST", formatINR(invoice.cgst));
    if (invoice.sgst > 0) totalRow("SGST", formatINR(invoice.sgst));
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
  doc.text(formatINR(invoice.total), valueX - 8, y + 5, { align: "right" });
  y += 40;

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
