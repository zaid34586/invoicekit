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

  // India → foreign client is zero-rated by law (export under LUT, Section 16
  // IGST Act). This is a compliance rule, not a user preference, so it always
  // stays at 0 regardless of any per-line rate entered.
  //
  // Bug-001 fix: previously EVERY cross-border invoice (not just India's)
  // was force-zeroed here, silently discarding any tax rate the user typed
  // into a line item. For non-India cross-border invoices there is no such
  // legal mandate in Rivox — decideTax() only *suggests* export-exempt as a
  // default (rate 0) and tells the user to verify with their advisor. So a
  // non-India cross-border invoice now falls through to the same flat
  // per-line-rate calculation used for domestic non-India invoices below,
  // meaning a manually-entered rate is respected instead of being ignored.
  if (isIndiaBusiness && isCrossBorder) {
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
    // isIndiaBusiness && !isCrossBorder here (the cross-border case returned above).
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

  // Non-India business — either domestic (same country as client) or
  // cross-border. Both use a flat tax at each line item's own rate, no
  // CGST/SGST split. For cross-border this defaults to 0 (decideTax()
  // suggests an export-exempt 0% rate that auto-fills the line items), but
  // if the user overrides the rate on a line, that rate is now honoured
  // instead of being silently zeroed out.
  for (const rate of sortedRates) {
    const { taxable } = rateMap.get(rate)!;
    const tax = (taxable * rate) / 100;
    igst += tax;
    breakup.push({ rate, cgst: 0, sgst: 0, igst: tax, taxable, tax });
  }

  const total = subtotal + igst;
  return { subtotal, cgst: 0, sgst: 0, igst, total, breakup, isInterState: true };
}
