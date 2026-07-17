import type { Invoice, Profile } from "./types";
import { formatDate } from "./constants";
import { formatMoney } from "./currency";

// NOTE: two international bugs fixed here.
// 1. `client_phone` is saved (see NewInvoice.tsx) already prefixed with the
//    client's own dial code, e.g. "+971 501234567" or "+1 5551234567" — so
//    after stripping non-digits it is ALREADY a valid international number
//    (e.g. "971501234567"). This function used to unconditionally prepend
//    "91" (India's code) to any number not already starting with "91",
//    which corrupted the number for every non-Indian client
//    (e.g. "971501234567" → wrongly became "91971501234567").
// 2. The message hardcoded formatINR() for the amount, so a UAE/US/UK
//    invoice's WhatsApp message would show "₹" instead of the invoice's
//    real currency.
export function buildWhatsAppLink(invoice: Invoice, profile: Profile): string {
  const phone = (invoice.client_phone || "").replace(/\D/g, "");
  const itemsList = invoice.items
    .map((it) => `${it.description} x${it.qty}`)
    .join(", ");

  const amount = formatMoney(
    Number(invoice.invoice_total ?? invoice.total),
    invoice.invoice_currency ?? invoice.business_currency ?? "INR"
  );
  const taxLabel = invoice.tax_label || "tax";

  const message =
    `Hello ${invoice.client_name}, your invoice ${invoice.invoice_number} ` +
    `for ${amount} is ready. Due: ${formatDate(invoice.due_date)}. ` +
    `Items: ${itemsList}. Total (incl ${taxLabel}): ${amount}. ` +
    `Thanks, ${profile.business_name || "Rivox User"}`;

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
