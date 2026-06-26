-- Drop the complex share policies
DROP POLICY IF EXISTS "public_share_invoice" ON invoices;
DROP POLICY IF EXISTS "public_share_profile" ON profiles;

-- Allow public read of invoices that have a share_token set
CREATE POLICY "public_share_invoice" ON invoices FOR SELECT
  TO anon, authenticated USING (share_token IS NOT NULL);

-- Allow public read of profiles for users who have at least one shared invoice
CREATE POLICY "public_share_profile" ON profiles FOR SELECT
  TO anon, authenticated USING (
    EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.user_id = profiles.user_id
        AND i.share_token IS NOT NULL
    )
  );
