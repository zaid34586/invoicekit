import type { Invoice, LineItem } from "./types";

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function lineSubtotal(items: LineItem[] | null | undefined): number {
  return (items ?? []).reduce(
    (sum, item) => sum + Number(item.qty || 0) * Number(item.rate || 0),
    0,
  );
}

function lineTax(items: LineItem[] | null | undefined): number {
  return (items ?? []).reduce((sum, item) => {
    const taxable = Number(item.qty || 0) * Number(item.rate || 0);
    return sum + (taxable * Number(item.gstRate || 0)) / 100;
  }, 0);
}

export function invoiceDisplayAmount(invoice: Invoice): number {
  const itemsSubtotal = lineSubtotal(invoice.items);
  const itemTotal = itemsSubtotal + lineTax(invoice.items);
  const storedInvoiceTotal = Number(invoice.invoice_total ?? invoice.total ?? 0);

  // Old cross-currency rows can contain an inflated stored total. The invoice
  // preview already repairs those rows from the locked line items; analytics
  // must use the same source of truth so Dashboard and Reports match Preview.
  if (itemsSubtotal > 0) {
    const mismatch =
      Math.abs(storedInvoiceTotal - itemTotal) >
      Math.max(0.01, Math.abs(itemTotal) * 0.001);
    if (mismatch) return round2(itemTotal);
  }

  return round2(storedInvoiceTotal);
}

export function invoiceBaseAmount(invoice: Invoice): number {
  const displayTotal = invoiceDisplayAmount(invoice);
  const rate = Number(invoice.exchange_rate ?? 1);
  const invoiceCurrency =
    invoice.invoice_currency ?? invoice.base_currency ?? invoice.business_currency;
  const baseCurrency = invoice.base_currency ?? invoice.business_currency;
  const isForeign = Boolean(
    invoiceCurrency && baseCurrency && invoiceCurrency !== baseCurrency,
  );

  if (isForeign && rate > 0) return round2(displayTotal / rate);

  const explicit = Number(invoice.base_total);
  if (Number.isFinite(explicit) && explicit >= 0) return round2(explicit);
  return round2(displayTotal);
}

export function invoiceBaseSubtotal(invoice: Invoice): number {
  const itemsSubtotal = lineSubtotal(invoice.items);
  const storedSubtotal = Number(
    invoice.invoice_subtotal ?? invoice.subtotal ?? 0,
  );
  const displaySubtotal =
    itemsSubtotal > 0 &&
    Math.abs(storedSubtotal - itemsSubtotal) >
      Math.max(0.01, Math.abs(itemsSubtotal) * 0.001)
      ? itemsSubtotal
      : storedSubtotal;

  const rate = Number(invoice.exchange_rate ?? 1);
  const invoiceCurrency =
    invoice.invoice_currency ?? invoice.base_currency ?? invoice.business_currency;
  const baseCurrency = invoice.base_currency ?? invoice.business_currency;

  if (
    invoiceCurrency &&
    baseCurrency &&
    invoiceCurrency !== baseCurrency &&
    rate > 0
  ) {
    return round2(displaySubtotal / rate);
  }
  return round2(displaySubtotal);
}

export function invoiceDate(invoice: Invoice): Date {
  return new Date(invoice.invoice_date || invoice.created_at);
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function endOfDay(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999,
  );
}

export function isWithin(date: Date, start: Date, end: Date): boolean {
  return date >= start && date <= end;
}
