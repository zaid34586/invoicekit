import { supabase } from "./supabase";

/**
 * Bug-010 fix: creating/updating an invoice or client inserts a row into
 * workspace_webhook_deliveries with status "pending", but nothing was ever
 * actually POSTing that payload to the customer's endpoint -- deliveries
 * just sat there until the owner manually clicked "Retry" in Business
 * Center. There is no pg_cron/pg_net job in this project to sweep them up
 * automatically.
 *
 * Fire-and-forget: right after any mutation that the audit trigger reacts
 * to (invoice/client insert, update, delete), ask the business-webhooks
 * function to flush whatever is currently due for this workspace. This is
 * intentionally non-blocking and swallows errors -- it must never interrupt
 * or slow down the invoice/client save the user is actually waiting on.
 */
export function deliverPendingWebhooks(): void {
  void supabase.functions
    .invoke("business-webhooks", { body: { action: "deliver-pending" } })
    .catch(() => {
      // Best-effort only. A failed delivery sweep here just means the
      // event stays "pending" and will be picked up next time any
      // invoice/client mutation happens, or via manual Retry.
    });
}
