import type { Invoice, Profile } from "./types";
import { formatINR, formatDate } from "./constants";

export function buildWhatsAppLink(invoice: Invoice, profile: Profile): string {
  const phone = (invoice.client_phone || "").replace(/\D/g, "");
  const itemsList = invoice.items
    .map((it) => `${it.description} x${it.qty}`)
    .join(", ");

  const message =
    `Hello ${invoice.client_name}, your invoice ${invoice.invoice_number} ` +
    `for ${formatINR(invoice.total)} is ready. Due: ${formatDate(invoice.due_date)}. ` +
    `Items: ${itemsList}. Total (incl GST): ${formatINR(invoice.total)}. ` +
    `Thanks, ${profile.business_name || "InvoiceKit User"}`;

  const normalizedPhone = phone.startsWith("91") ? phone : `91${phone}`;
  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
}
