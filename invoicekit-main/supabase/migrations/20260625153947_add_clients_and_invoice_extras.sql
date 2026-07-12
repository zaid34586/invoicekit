-- Clients table
CREATE TABLE clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  email text,
  address text,
  state text,
  gstin text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_clients" ON clients FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_clients" ON clients FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_clients" ON clients FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_clients" ON clients FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Add share_token and client_gstin to invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS share_token text UNIQUE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_gstin text;

-- Index for share_token lookups (public share page)
CREATE INDEX IF NOT EXISTS idx_invoices_share_token ON invoices(share_token) WHERE share_token IS NOT NULL;

-- Allow public read of invoices by share_token (no auth required)
CREATE POLICY "public_share_invoice" ON invoices FOR SELECT
  TO anon, authenticated USING (share_token IS NOT NULL AND share_token = current_setting('request.share_token', true));

-- Allow public read of profiles by matching invoice owner (for share page)
CREATE POLICY "public_share_profile" ON profiles FOR SELECT
  TO anon, authenticated USING (
    EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.user_id = profiles.user_id
        AND i.share_token IS NOT NULL
        AND i.share_token = current_setting('request.share_token', true)
    )
  );
