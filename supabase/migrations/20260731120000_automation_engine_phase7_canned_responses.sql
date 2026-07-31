-- Automation Engine Phase 7: canned responses/macros (design doc Section 8).

CREATE TABLE IF NOT EXISTS canned_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE canned_responses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_manage_canned_responses" ON canned_responses;
DROP POLICY IF EXISTS "staff_read_canned_responses" ON canned_responses;
CREATE POLICY "admin_manage_canned_responses" ON canned_responses FOR ALL
  TO authenticated USING (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com')
  WITH CHECK (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');
CREATE POLICY "staff_read_canned_responses" ON canned_responses FOR SELECT
  TO authenticated USING (
    is_active AND EXISTS (
      SELECT 1 FROM admin_team_members tm
      WHERE tm.status = 'active' AND (tm.auth_user_id = auth.uid() OR lower(tm.email) = lower(auth.jwt() ->> 'email'))
    )
  );

INSERT INTO canned_responses (title, body)
SELECT * FROM (VALUES
  ('Ask for more details', 'Thanks for reaching out! Could you share a bit more detail (screenshots help) so we can look into this properly?'),
  ('Password reset steps', 'You can reset your password from the Login page -> "Forgot password?" -> enter your email and follow the link we send you. Let us know if that doesn''t work.'),
  ('Refund processing', 'We''ve received your refund request and it''s being processed by our finance team. Refunds typically take 5-7 business days to reflect depending on your bank/provider.'),
  ('Invoice/billing question', 'Thanks for flagging this -- taking a look at your billing/invoice now and will follow up shortly with details.'),
  ('Closing resolved ticket', 'Glad we could help! Marking this resolved -- feel free to reopen or start a new ticket if anything else comes up.')
) AS seed(title, body)
WHERE NOT EXISTS (SELECT 1 FROM canned_responses);
