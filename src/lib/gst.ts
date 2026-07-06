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

/**
 * Computes subtotal/tax/total for an invoice.
 *
 * IMPORTANT: this used to ALWAYS apply India's CGST/SGST/IGST split logic to
 * every invoice, regardless of the business's actual country. A US, UK,
 * Australian, etc. business would still get an 18%-style India GST split
 * baked into the total. That was a real bug (wrong tax charged), not just a
 * display issue — fixed here by branching on businessCountry/clientCountry:
 *
 *  - Business in India            → original CGST+SGST / IGST logic, unchanged.
 *  - Business & client, different countries → treated as zero-rated / export
 *    (cross-border supply — matches decideTax()'s export/exempt decision;
 *    no automatic tax is charged, consistent with how it's labelled).
 *  - Business outside India, same country as client → a flat tax at each
 *    line item's own rate (the "Tax %" field), with no CGST/SGST split.
 *    India-specific field names (cgst/sgst/igst) are kept for storage
 *    compatibility — the flat tax is stored in `igst` purely as a "single
 *    tax line" bucket, and isInterState=true is reused to tell callers to
 *    render ONE tax line (with decideTax()'s label, e.g. "GST", "VAT",
 *    "Sales Tax") instead of a CGST+SGST split. This mirrors what
 *    InvoicePreview/pdf.ts already do when reading igst back from a saved
 *    invoice, so no downstream display code needed to change.
 */
export function calculateInvoice(
  items: LineItem[],
  businessState: string | null,
  clientState: string | null,
  businessCountry: string | null = "India",
  clientCountry: string | null = businessCountry ?? "India"
): InvoiceCalc {
  const subtotal = items.reduce((sum, it) => sum + lineAmount(it), 0);

  const rateMap = new Map<number, { taxable: number }>();
  for (const it of items) {
    const amt = lineAmount(it);
    const rate = it.gstRate || 0;
    const entry = rateMap.get(rate) ?? { taxable: 0 };
    entry.taxable += amt;
    rateMap.set(rate, entry);
  }
  const sortedRates = [...rateMap.keys()].sort((a, b) => a - b);

  const isIndiaBusiness = (businessCountry ?? "India") === "India";
  const isCrossBorder = (businessCountry ?? "India") !== (clientCountry ?? businessCountry ?? "India");

  // Cross-border supply (any country pair) — zero-rated/exempt, no tax charged.
  if (isCrossBorder) {
    return {
      subtotal,
      cgst: 0,
      sgst: 0,
      igst: 0,
      total: subtotal,
      breakup: [],
      isInterState: false,
    };
  }

  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  const breakup: GstBreakup[] = [];

  if (isIndiaBusiness) {
    const isInterState =
      !!businessState && !!clientState && businessState !== clientState;

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

  // Non-India, same-country supply: flat tax per line rate, no CGST/SGST split.
  for (const rate of sortedRates) {
    const { taxable } = rateMap.get(rate)!;
    const tax = (taxable * rate) / 100;
    igst += tax;
    breakup.push({ rate, cgst: 0, sgst: 0, igst: tax, taxable, tax });
  }

  const total = subtotal + igst;
  return { subtotal, cgst: 0, sgst: 0, igst, total, breakup, isInterState: true };
}
