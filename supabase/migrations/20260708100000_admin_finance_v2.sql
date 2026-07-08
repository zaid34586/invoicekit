-- InvoiceKit Admin Finance v2.
-- Safe to run multiple times. Adds reporting-friendly fields and indexes.

CREATE TABLE IF NOT EXISTS admin_finance_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL DEFAULT current_date,
  type text NOT NULL CHECK (type IN ('income','expense','receivable')),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('subscription','ads','manual','invoice','other')),
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'INR',
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','pending','spent')),
  title text NOT NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_finance_entries ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE admin_finance_entries ADD COLUMN IF NOT EXISTS reference_id text;
ALTER TABLE admin_finance_entries ADD COLUMN IF NOT EXISTS vendor_or_channel text;
ALTER TABLE admin_finance_entries ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE admin_finance_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_all_finance_entries" ON admin_finance_entries;
DROP POLICY IF EXISTS "admin_manage_finance_entries" ON admin_finance_entries;

CREATE POLICY "admin_read_all_finance_entries" ON admin_finance_entries FOR SELECT
  TO authenticated USING (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');

CREATE POLICY "admin_manage_finance_entries" ON admin_finance_entries FOR ALL
  TO authenticated USING (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com')
  WITH CHECK (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');

CREATE INDEX IF NOT EXISTS idx_admin_finance_entry_date ON admin_finance_entries(entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_admin_finance_status ON admin_finance_entries(status);
CREATE INDEX IF NOT EXISTS idx_admin_finance_source ON admin_finance_entries(source);
CREATE INDEX IF NOT EXISTS idx_admin_finance_type ON admin_finance_entries(type);
