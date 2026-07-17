import type { Invoice } from "./types";

export function invoiceBaseAmount(invoice: Invoice): number {
  const explicit = Number(invoice.base_total);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;

  const invoiceTotal = Number(invoice.invoice_total ?? invoice.total ?? 0);
  const rate = Number(invoice.exchange_rate ?? 1);
  const invoiceCurrency = invoice.invoice_currency ?? invoice.base_currency ?? invoice.business_currency;
  const baseCurrency = invoice.base_currency ?? invoice.business_currency;

  if (invoiceCurrency && baseCurrency && invoiceCurrency !== baseCurrency && rate > 0) {
    return invoiceTotal / rate;
  }
  return invoiceTotal;
}

export function invoiceBaseSubtotal(invoice: Invoice): number {
  const explicit = Number(invoice.base_subtotal);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;

  const subtotal = Number(invoice.invoice_subtotal ?? invoice.subtotal ?? 0);
  const rate = Number(invoice.exchange_rate ?? 1);
  const invoiceCurrency = invoice.invoice_currency ?? invoice.base_currency ?? invoice.business_currency;
  const baseCurrency = invoice.base_currency ?? invoice.business_currency;

  if (invoiceCurrency && baseCurrency && invoiceCurrency !== baseCurrency && rate > 0) {
    return subtotal / rate;
  }
  return subtotal;
}

export function invoiceDate(invoice: Invoice): Date {
  return new Date(invoice.invoice_date || invoice.created_at);
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

export function isWithin(date: Date, start: Date, end: Date): boolean {
  return date >= start && date <= end;
}
