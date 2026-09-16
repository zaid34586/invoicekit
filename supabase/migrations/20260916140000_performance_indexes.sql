-- Performance: the app grows a business's invoices/clients unbounded on paid
-- plans, and the list pages sort by created_at filtered by user_id. Without
-- composite indexes Postgres scans and sorts the whole table per query.
-- These cover the exact query shapes used by Dashboard/Invoices/Clients.
CREATE INDEX IF NOT EXISTS idx_invoices_user_created
  ON invoices (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_clients_user_created
  ON clients (user_id, created_at DESC);
