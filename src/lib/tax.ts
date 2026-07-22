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
    defaultRate: 0,   // resolved per-state below via US_STATE_SALES_TAX
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
    label: "GST/HST",
    defaultRate: 5,  // resolved per-province below via CANADA_PROVINCE_TAX
    note: "Federal GST at 5% applies. Provincial HST/PST may also apply — verify with your accountant.",
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
  Japan: {
    label: "Consumption Tax",
    defaultRate: 10,
    note: "Japanese Consumption Tax at 10% applies.",
  },
  Germany: { label: "VAT", defaultRate: 19, note: "German VAT (USt) at 19% applies." },
  France: { label: "VAT", defaultRate: 20, note: "French VAT (TVA) at 20% applies." },
  Italy: { label: "VAT", defaultRate: 22, note: "Italian VAT (IVA) at 22% applies." },
  Spain: { label: "VAT", defaultRate: 21, note: "Spanish VAT (IVA) at 21% applies." },
  Netherlands: { label: "VAT", defaultRate: 21, note: "Dutch VAT (BTW) at 21% applies." },
  Belgium: { label: "VAT", defaultRate: 21, note: "Belgian VAT at 21% applies." },
  Austria: { label: "VAT", defaultRate: 20, note: "Austrian VAT at 20% applies." },
  Ireland: { label: "VAT", defaultRate: 23, note: "Irish VAT at 23% applies." },
  Portugal: { label: "VAT", defaultRate: 23, note: "Portuguese VAT at 23% applies." },
  Poland: { label: "VAT", defaultRate: 23, note: "Polish VAT at 23% applies." },
  Denmark: { label: "VAT", defaultRate: 25, note: "Danish VAT (moms) at 25% applies." },
  Finland: { label: "VAT", defaultRate: 25.5, note: "Finnish VAT (ALV) at 25.5% applies." },
  Norway: { label: "VAT", defaultRate: 25, note: "Norwegian VAT (MVA) at 25% applies." },
  Sweden: { label: "VAT", defaultRate: 25, note: "Swedish VAT (moms) at 25% applies." },
  Switzerland: { label: "VAT", defaultRate: 8.1, note: "Swiss VAT (MWST) at 8.1% applies." },
  "New Zealand": { label: "GST", defaultRate: 15, note: "New Zealand GST at 15% applies." },
  "South Africa": { label: "VAT", defaultRate: 15, note: "South African VAT at 15% applies." },
  Israel: { label: "VAT", defaultRate: 17, note: "Israeli VAT at 17% applies." },
  Turkey: { label: "VAT", defaultRate: 20, note: "Turkish VAT (KDV) at 20% applies." },
  "Saudi Arabia": { label: "VAT", defaultRate: 15, note: "Saudi VAT at 15% applies." },
  Qatar: { label: "VAT", defaultRate: 0, note: "Qatar currently applies no general VAT." },
  Kuwait: { label: "VAT", defaultRate: 0, note: "Kuwait currently applies no general VAT." },
  Oman: { label: "VAT", defaultRate: 5, note: "Omani VAT at 5% applies." },
  Malaysia: { label: "SST", defaultRate: 6, note: "Malaysian Sales & Service Tax at 6% applies." },
  Indonesia: { label: "VAT", defaultRate: 11, note: "Indonesian VAT (PPN) at 11% applies." },
  Thailand: { label: "VAT", defaultRate: 7, note: "Thai VAT at 7% applies." },
  Philippines: { label: "VAT", defaultRate: 12, note: "Philippine VAT at 12% applies." },
  Vietnam: { label: "VAT", defaultRate: 10, note: "Vietnamese VAT at 10% applies." },
  China: { label: "VAT", defaultRate: 13, note: "Chinese VAT at 13% applies (standard rate)." },
  "Hong Kong": { label: "Tax", defaultRate: 0, note: "Hong Kong applies no general sales tax/VAT." },
  Mexico: { label: "VAT", defaultRate: 16, note: "Mexican VAT (IVA) at 16% applies." },
  Brazil: { label: "Tax", defaultRate: 0, note: "Brazilian indirect tax (ICMS/ISS) varies by state/service — verify with your accountant." },
  Argentina: { label: "VAT", defaultRate: 21, note: "Argentine VAT (IVA) at 21% applies." },
  Egypt: { label: "VAT", defaultRate: 14, note: "Egyptian VAT at 14% applies." },
  Nigeria: { label: "VAT", defaultRate: 7.5, note: "Nigerian VAT at 7.5% applies." },
  Kenya: { label: "VAT", defaultRate: 16, note: "Kenyan VAT at 16% applies." },
  Pakistan: { label: "Sales Tax", defaultRate: 18, note: "Pakistani Sales Tax at 18% applies." },
  Bangladesh: { label: "VAT", defaultRate: 15, note: "Bangladeshi VAT at 15% applies." },
  "Sri Lanka": { label: "VAT", defaultRate: 18, note: "Sri Lankan VAT at 18% applies." },
};

/** Returns true when Rivox has a maintained automatic default tax rule.
 * India is handled separately by the GST decision logic.
 */
export function hasConfiguredCountryTax(country: string | null | undefined): boolean {
  const normalized = normaliseCountry(country);
  return normalized === "India" || Boolean(COUNTRY_TAX_RULES[normalized]);
}

/** Lightweight public summary used by settings and invoice UI. */
export function getCountryTaxSummary(country: string | null | undefined): {
  label: string;
  defaultRate: number | null;
  configured: boolean;
  note: string;
} {
  const normalized = normaliseCountry(country);
  if (normalized === "India") {
    return {
      label: "GST",
      defaultRate: 18,
      configured: true,
      note: "GST is selected per invoice line. CGST/SGST or IGST is determined from business and client state.",
    };
  }
  const rule = COUNTRY_TAX_RULES[normalized];
  if (!rule) {
    return {
      label: "Tax",
      defaultRate: null,
      configured: false,
      note: `No automatic default tax rate is configured for ${normalized}. Enter the applicable rate manually and verify it with a tax professional.`,
    };
  }
  return { label: rule.label, defaultRate: rule.defaultRate, configured: true, note: rule.note };
}

// Approximate combined average state + local sales tax rate (%). Real-world
// rates vary by city/county; these are reasonable state-level defaults a
// user can still see and verify before sending the invoice.
const US_STATE_SALES_TAX: Record<string, number> = {
  Alabama: 9.29, Alaska: 1.76, Arizona: 8.4, Arkansas: 9.48, California: 8.82,
  Colorado: 7.81, Connecticut: 6.35, Delaware: 0, Florida: 7.02, Georgia: 7.4,
  Hawaii: 4.44, Idaho: 6.03, Illinois: 8.86, Indiana: 7, Iowa: 6.94,
  Kansas: 8.7, Kentucky: 6, Louisiana: 9.55, Maine: 5.5, Maryland: 6,
  Massachusetts: 6.25, Michigan: 6, Minnesota: 7.49, Mississippi: 7.07,
  Missouri: 8.39, Montana: 0, Nebraska: 6.94, Nevada: 8.23,
  "New Hampshire": 0, "New Jersey": 6.6, "New Mexico": 7.83, "New York": 8.52,
  "North Carolina": 6.98, "North Dakota": 6.96, Ohio: 7.24, Oklahoma: 8.98,
  Oregon: 0, Pennsylvania: 6.34, "Rhode Island": 7, "South Carolina": 7.46,
  "South Dakota": 6.4, Tennessee: 9.55, Texas: 8.2, Utah: 7.19,
  Vermont: 6.24, Virginia: 5.75, Washington: 8.86, "West Virginia": 6.5,
  Wisconsin: 5.43, Wyoming: 5.36,
};

// Combined federal GST + provincial HST/PST (%), by province.
const CANADA_PROVINCE_TAX: Record<string, number> = {
  Alberta: 5, "British Columbia": 12, Manitoba: 12, "New Brunswick": 15,
  "Newfoundland and Labrador": 15, "Nova Scotia": 15, Ontario: 13,
  "Prince Edward Island": 15, Quebec: 14.975, Saskatchewan: 11,
  "Northwest Territories": 5, Nunavut: 5, Yukon: 5,
};

// EU member states currently in our country list. Used to detect the
// intra-EU B2B "reverse charge" scenario, where no VAT is charged on the
// invoice but the recipient self-accounts for it in their own country —
// this is legally different from a plain non-EU export, so it gets its
// own label and note rather than being lumped in with "Export – Exempt".
const EU_COUNTRIES = new Set([
  "Austria", "Belgium", "Denmark", "Finland", "France", "Germany",
  "Ireland", "Italy", "Netherlands", "Poland", "Portugal", "Spain", "Sweden",
]);

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

      // US and Canada: resolve the real rate from the client's state/province
      // when known, instead of the flat country-level placeholder.
      let effectiveRate = rule.defaultRate;
      let effectiveNote = rule.note;

      if (bCountry === "United States" && cState) {
        const stateRate = US_STATE_SALES_TAX[cState];
        if (stateRate !== undefined) {
          effectiveRate = stateRate;
          effectiveNote =
            stateRate === 0
              ? `${cState} has no state sales tax.`
              : `Combined state + local sales tax for ${cState}: approx. ${stateRate}%. Verify with your tax advisor, as local rates vary by city/county.`;
        }
      }

      if (bCountry === "Canada" && cState) {
        const provinceRate = CANADA_PROVINCE_TAX[cState];
        if (provinceRate !== undefined) {
          effectiveRate = provinceRate;
          effectiveNote = `Combined GST/HST/PST for ${cState}: ${provinceRate}%.`;
        }
      }

      return {
        taxType: type,
        taxLabel: rule.label,
        taxRate: effectiveRate,
        cgst: 0,
        sgst: 0,
        igst: 0,
        taxNote: effectiveNote,
        isZeroRated: false,
        isCgstSgst: false,
        isIgst: false,
        isInternational: false,
      };
    }
  }

  // 2b. Cross-border (non-India business, client in different country)
  if (bCountry !== cCountry) {
    // Intra-EU B2B: reverse charge applies — no VAT on the invoice, but the
    // recipient self-accounts for it in their own country. This is legally
    // distinct from a plain export outside the EU.
    if (EU_COUNTRIES.has(bCountry) && EU_COUNTRIES.has(cCountry)) {
      return {
        taxType: "reverse_charge",
        taxLabel: "Reverse Charge",
        taxRate: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
        taxNote: `Reverse charge applies (EU B2B, ${bCountry} → ${cCountry}). No VAT charged — the recipient accounts for VAT in ${cCountry} under the reverse charge mechanism.`,
        isZeroRated: true,
        isCgstSgst: false,
        isIgst: false,
        isInternational: true,
      };
    }

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

  // ── Fallback: same-country rule not maintained yet ───────────────────────
  return {
    taxType: "unknown",
    taxLabel: "Tax (manual)",
    taxRate: 0,
    cgst: 0,
    sgst: 0,
    igst: 0,
    taxNote: `No automatic default tax rate is configured for ${bCountry}. Enter the applicable rate manually and verify it with a tax professional.`,
    isZeroRated: false,
    isCgstSgst: false,
    isIgst: false,
    isInternational: false,
  };
}