import type { LineItem } from "./types";
import { calculateInvoice } from "./gst";
import { decideTax } from "./tax";

export interface TaxCalculation {
  subtotal: number;
  tax: number;
  total: number;
  cgst: number;
  sgst: number;
  igst: number;
  taxLabel: string;
  taxType: string;
  taxRate: number;
  taxNote: string;
}

export interface TaxCalculationInput {
  items: LineItem[];
  businessCountry: string | null;
  businessState: string | null;
  clientCountry: string | null;
  clientState: string | null;
}

/**
 * Unified calculation facade for callers that need both the monetary totals
 * and the country-aware tax metadata. This keeps UI, PDF and API consumers
 * from accidentally applying India GST logic to non-India invoices.
 */
export function calculateTax(input: TaxCalculationInput): TaxCalculation {
  const decision = decideTax({
    businessCountry: input.businessCountry,
    businessState: input.businessState,
    clientCountry: input.clientCountry,
    clientState: input.clientState,
    defaultGstRate: input.items[0]?.gstRate ?? 0,
  });

  const result = calculateInvoice(
    input.items,
    input.businessState,
    input.clientState,
    input.businessCountry,
    input.clientCountry
  );

  return {
    subtotal: result.subtotal,
    tax: result.cgst + result.sgst + result.igst,
    total: result.total,
    cgst: result.cgst,
    sgst: result.sgst,
    igst: result.igst,
    taxLabel: decision.taxLabel,
    taxType: decision.taxType,
    taxRate: decision.taxRate,
    taxNote: decision.taxNote,
  };
}
