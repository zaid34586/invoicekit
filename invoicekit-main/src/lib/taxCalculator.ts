import type { LineItem } from "./types";


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

export function calculateTax(
  _input: TaxCalculationInput
): TaxCalculation {
  throw new Error("Not implemented yet");
}