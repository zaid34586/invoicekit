-- The `clients` table was created without `country` / `country_code` columns,
-- but the frontend (NewInvoice.tsx auto-save-on-invoice, and the manual
-- "Add client" form in Clients.tsx) has always written these fields on
-- insert. Because the insert's error was never checked in NewInvoice.tsx,
-- every one of those inserts was silently failing (Postgres rejects an
-- insert referencing a column that doesn't exist) -- invoices saved fine,
-- but no client row was ever created, so the Clients page stayed empty
-- no matter how many invoices were created.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS country_code text;
