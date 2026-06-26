export interface Profile {
  id: string;
  user_id: string;
  business_name: string | null;
  gstin: string | null;
  phone: string | null;
  email: string | null;
  state: string | null;
  address: string | null;
  logo_url: string | null;
  is_pro: boolean;
  created_at: string;
}

export interface Client {
  id: string;
  user_id: string;
  name: string;
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
  status: InvoiceStatus;
  notes: string | null;
  invoice_date: string;
  due_date: string;
  share_token: string | null;
  created_at: string;
}
