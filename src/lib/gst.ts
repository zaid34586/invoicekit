import type { LineItem } from "./types";

export interface GstBreakup {
  rate: number;
  cgst: number;
  sgst: number;
  igst: number;
  taxable: number;
  tax: number;
}

export interface InvoiceCalc {
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  breakup: GstBreakup[];
  isInterState: boolean;
}

export function lineAmount(item: LineItem): number {
  return (item.qty || 0) * (item.rate || 0);
}

export function calculateInvoice(
  items: LineItem[],
  businessState: string | null,
  clientState: string | null
): InvoiceCalc {
  const isInterState =
    !!businessState && !!clientState && businessState !== clientState;

  const subtotal = items.reduce((sum, it) => sum + lineAmount(it), 0);

  const rateMap = new Map<number, { taxable: number }>();
  for (const it of items) {
    const amt = lineAmount(it);
    const rate = it.gstRate || 0;
    const entry = rateMap.get(rate) ?? { taxable: 0 };
    entry.taxable += amt;
    rateMap.set(rate, entry);
  }

  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  const breakup: GstBreakup[] = [];

  const sortedRates = [...rateMap.keys()].sort((a, b) => a - b);
  for (const rate of sortedRates) {
    const { taxable } = rateMap.get(rate)!;
    const tax = (taxable * rate) / 100;
    if (isInterState) {
      igst += tax;
      breakup.push({ rate, cgst: 0, sgst: 0, igst: tax, taxable, tax });
    } else {
      const half = tax / 2;
      cgst += half;
      sgst += half;
      breakup.push({ rate, cgst: half, sgst: half, igst: 0, taxable, tax });
    }
  }

  const total = subtotal + cgst + sgst + igst;

  return { subtotal, cgst, sgst, igst, total, breakup, isInterState };
}
