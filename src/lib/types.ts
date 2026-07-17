export interface Profile {
  id: string;
  user_id: string;

  email: string | null;

  business_name: string | null;
  gstin: string | null;
  phone: string | null;
  phone_verified: boolean;

  state: string | null;
  address: string | null;
  logo_url: string | null;

  is_pro: boolean;
  credits?: number | null;
  free_pro_until?: string | null;
  admin_notes?: string | null;
  is_banned?: boolean | null;

  // ── International business fields ─────────────────────────────────────
  country: string | null;       // e.g. "India", "United States"
  country_code: string | null;  // dial code e.g. "+91"
  timezone: string | null;      // e.g. "Asia/Kolkata"
  date_format: string | null;   // e.g. "DD/MM/YYYY"
  // ────────────────────────────────────────────────────────────────────────

  currency: string | null;
  payment_gateway: string | null;

  plan: "free" | "pro" | "business";

  subscription_status:
    | "inactive"
    | "active"
    | "cancelled"
    | "expired";

  subscription_id: string | null;

  plan_expires_at: string | null;

  created_at: string;
}

export interface Client {
  id: string;
  user_id: string;

  name: string;
  company_name: string | null;

  country: string | null;
  country_code: string | null;

  phone: string | null;
  email: string | null;
  address: string | null;
  state: string | null;
  gstin: string | null;

  created_at: string;
}

export interface LineItem {
  id: string;
  description: string;
  qty: number;
  rate: number;
  gstRate: number;
  hsnSac: string;
}

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue";

export interface Invoice {
  id: string;
  user_id: string;
  invoice_number: string;
  client_name: string;
  client_phone: string | null;
  client_email: string | null;
  client_address: string | null;
  client_state: string | null;
  client_gstin: string | null;

  items: LineItem[];

  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;

  // ── Multi-currency fields (existing) ─────────────────────────────────────
  // ISO 4217 code of the invoice currency, e.g. "USD". Null means INR.
  invoice_currency: string | null;
  // Rate locked at save time: 1 base-currency unit = exchange_rate invoice units
  exchange_rate: number | null;
  // Total expressed in the business base currency (INR by default)
  base_total: number | null;
  // ────────────────────────────────────────────────────────────────────────

  // ── Self-contained snapshot fields (new) ─────────────────────────────────
  // These make an invoice a standalone legal document: once saved, Preview,
  // PDF, and Reports should never need to look up Clients or Profile again.
  // All are nullable for backward compatibility with invoices created before
  // this migration (old rows will simply have null here).
  business_country: string | null;
  business_state: string | null;
  business_currency: string | null;

  client_country: string | null;

  base_currency: string | null;
  exchange_rate_date: string | null; // ISO date, when the rate was locked

  tax_type: string | null;    // TaxType from tax.ts, e.g. "domestic_same_state"
  tax_label: string | null;   // e.g. "CGST + SGST", "VAT", "GST"
  tax_note: string | null;    // human-readable note shown on invoice

  base_subtotal: number | null;    // subtotal in business base currency
  invoice_subtotal: number | null; // subtotal converted to invoice currency
  invoice_total: number | null;    // total converted to invoice currency
  // ────────────────────────────────────────────────────────────────────────

  status: InvoiceStatus;

  notes: string | null;

  invoice_date: string;
  due_date: string;

  share_token: string | null;

  created_at: string;
}
