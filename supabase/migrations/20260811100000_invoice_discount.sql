-- Invoice-level discount (e.g. "10% off this invoice", or a flat amount
-- off) -- previously did not exist at all; the test roadmap referenced
-- verifying it, but there was no such field on invoices anywhere.

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_type text CHECK (discount_type IN ('percentage', 'fixed'));
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_value numeric NOT NULL DEFAULT 0;
-- Discount amount in the invoice's own currency, stored alongside the
-- computed total so Preview/PDF/Reports can display it without
-- recomputing it from discount_type + discount_value + line items.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0;
