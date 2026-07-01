// ─── Tax Decision Engine ────────────────────────────────────────────────────
// Determines the correct tax type, label, and note based on:
//   - Business country + state
//   - Client country + state
//   - B2B / B2C flag
//
// This module is intentionally pure (no side effects, no API calls).
// It does NOT replace gst.ts — gst.ts still does the actual math.
// This engine only decides WHAT applies; gst.ts computes HOW MUCH.
// ────────────────────────────────────────────────────────────────────────────

export type TaxType =
  | "domestic_same_state"   // India, same state → CGST + SGST
  | "domestic_inter_state"  // India, different state → IGST
  | "export_zero_rated"     // India → foreign country, under LUT
  | "reverse_charge"        // Recipient pays tax
  | "vat"                   // UK, UAE, South Korea
  | "au_gst"                // Australia GST
  | "sales_tax"             // USA (placeholder)
  | "sg_gst"                // Singapore GST
  | "international_exempt"  // Cross-border, no local tax applicable
  | "unknown";              // Fallback

export interface TaxDecision {
  /** Machine-readable tax category */
  taxType: TaxType;

  /** Human-readable label shown on the invoice (e.g. "CGST + SGST", "VAT") */
  taxLabel: string;

  /**
   * Effective tax rate in percent (e.g. 18 for 18%).
   * For export/zero-rated this is 0.
   * For line-item-based taxes (India), this is the default/fallback rate;
   * the actual per-line rate comes from LineItem.gstRate in gst.ts.
   */
  taxRate: number;

  /**
   * Split rates for India same-state invoices.
   * cgst = sgst = half of taxRate; igst = 0.
   * For inter-state: cgst = sgst = 0; igst = taxRate.
   * For non-India: all are 0 (tax is represented by taxRate directly).
   */
  cgst: number;
  sgst: number;
  igst: number;

  /** Plain-language note printed on the invoice or shown in the UI */
  taxNote: string;

  /** Whether this invoice qualifies as a zero-rated / export supply */
  isZeroRated: boolean;

  /** Whether CGST+SGST split applies (India intra-state) */
  isCgstSgst: boolean;

  /** Whether IGST applies (India inter-state) */
  isIgst: boolean;

  /** Whether this is a cross-border (export/import) invoice */
  isInternational: boolean;
}

// ── Helper ───────────────────────────────────────────────────────────────────

/** Normalise a country string to a canonical key used in this engine. */
function normaliseCountry(raw: string | null | undefined): string {
  if (!raw) return "India"; // default to India for existing data
  return raw.trim();
}

// ── Country-level tax rules ───────────────────────────────────────────────────

interface CountryTaxRule {
  label: string;
  defaultRate: number;
  note: string;
}

const COUNTRY_TAX_RULES: Record<string, CountryTaxRule> = {
  "United States": {
    label: "Sales Tax",
    defaultRate: 0,   // Sales tax varies by state — placeholder
    note: "Sales tax may apply depending on the destination state. Please verify with your tax advisor.",
  },
  "United Kingdom": {
    label: "VAT",
    defaultRate: 20,
    note: "VAT at 20% applies. Ensure your VAT registration is valid.",
  },
  Australia: {
    label: "GST",
    defaultRate: 10,
    note: "Australian GST at 10% applies.",
  },
  UAE: {
    label: "VAT",
    defaultRate: 5,
    note: "UAE VAT at 5% applies per Federal Tax Authority rules.",
  },
  Canada: {
    label: "GST / HST",
    defaultRate: 5,  // Federal GST; provincial HST varies
    note: "Federal GST at 5% applies. Provincial HST may also apply — verify with your accountant.",
  },
  Singapore: {
    label: "GST",
    defaultRate: 9,
    note: "Singapore GST at 9% applies.",
  },
  "South Korea": {
    label: "VAT",
    defaultRate: 10,
    note: "Korean VAT at 10% applies.",
  },
};

// ── Main decision function ────────────────────────────────────────────────────

export interface TaxDecisionInput {
  /** Country where the business is registered (e.g. "India") */
  businessCountry: string | null;
  /** State/province of the business (for India intra/inter logic) */
  businessState: string | null;
  /** Country of the client */
  clientCountry: string | null;
  /** State/province of the client (for India intra/inter logic) */
  clientState: string | null;
  /** Is this a B2B invoice? (affects reverse-charge eligibility in future) */
  isB2B?: boolean;
  /**
   * Default line-item GST rate — used when we need a single taxRate
   * in the decision object. Actual per-line rates are in gst.ts.
   */
  defaultGstRate?: number;
}

export function decideTax(input: TaxDecisionInput): TaxDecision {
  const {
    businessState,
    defaultGstRate = 18,
  } = input;

  const bCountry = normaliseCountry(input.businessCountry);
  const cCountry = normaliseCountry(input.clientCountry);
  const bState = (businessState ?? "").trim();
  const cState = (input.clientState ?? "").trim();

  // ── 1. India business ─────────────────────────────────────────────────────
  if (bCountry === "India") {

    // 1a. Export — client is outside India
    if (cCountry !== "India") {
      return {
        taxType: "export_zero_rated",
        taxLabel: "Export – Zero Rated",
        taxRate: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
        taxNote: "Export under LUT – Zero Rated Supply (Section 16, IGST Act 2017). No tax charged.",
        isZeroRated: true,
        isCgstSgst: false,
        isIgst: false,
        isInternational: true,
      };
    }

    // 1b. India → India, same state
    if (bState && cState && bState === cState) {
      const half = defaultGstRate / 2;
      return {
        taxType: "domestic_same_state",
        taxLabel: "CGST + SGST",
        taxRate: defaultGstRate,
        cgst: half,
        sgst: half,
        igst: 0,
        taxNote: `Intra-state supply. CGST ${half}% + SGST ${half}% applies.`,
        isZeroRated: false,
        isCgstSgst: true,
        isIgst: false,
        isInternational: false,
      };
    }

    // 1c. India → India, different state (or state unknown)
    return {
      taxType: "domestic_inter_state",
      taxLabel: "IGST",
      taxRate: defaultGstRate,
      cgst: 0,
      sgst: 0,
      igst: defaultGstRate,
      taxNote:
        bState && cState
          ? `Inter-state supply (${bState} → ${cState}). IGST ${defaultGstRate}% applies.`
          : "Set both business and client state to confirm CGST/SGST or IGST.",
      isZeroRated: false,
      isCgstSgst: false,
      isIgst: true,
      isInternational: false,
    };
  }

  // ── 2. Non-India business ─────────────────────────────────────────────────

  // 2a. Business and client in the same non-India country
  if (bCountry === cCountry) {
    const rule = COUNTRY_TAX_RULES[bCountry];
    if (rule) {
      const type: TaxType =
        bCountry === "Australia" ? "au_gst" :
        bCountry === "Singapore" ? "sg_gst" :
        bCountry === "United States" ? "sales_tax" :
        "vat";
      return {
        taxType: type,
        taxLabel: rule.label,
        taxRate: rule.defaultRate,
        cgst: 0,
        sgst: 0,
        igst: 0,
        taxNote: rule.note,
        isZeroRated: false,
        isCgstSgst: false,
        isIgst: false,
        isInternational: false,
      };
    }
  }

  // 2b. Cross-border (non-India business, client in different country)
  if (bCountry !== cCountry) {
    return {
      taxType: "international_exempt",
      taxLabel: "Export – Exempt",
      taxRate: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      taxNote: `Cross-border supply from ${bCountry} to ${cCountry}. Local tax typically not applicable — verify with your tax advisor.`,
      isZeroRated: true,
      isCgstSgst: false,
      isIgst: false,
      isInternational: true,
    };
  }

  // ── Fallback ──────────────────────────────────────────────────────────────
  return {
    taxType: "unknown",
    taxLabel: "Tax",
    taxRate: 0,
    cgst: 0,
    sgst: 0,
    igst: 0,
    taxNote: "Unable to determine tax type. Please verify with your tax advisor.",
    isZeroRated: false,
    isCgstSgst: false,
    isIgst: false,
    isInternational: false,
  };
}