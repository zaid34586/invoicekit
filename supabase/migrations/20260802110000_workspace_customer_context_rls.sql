-- Advanced Workspace redesign — backend support.
-- Widen customer-context read access (profiles/invoices/clients) to the
-- 'standard' tier and 'finance' where missing, so the new workspace's
-- customer-context panel works for every staff member who can actually be
-- assigned a ticket, not just the original 4 legacy roles.

DROP POLICY IF EXISTS "staff_read_customer_profiles" ON profiles;
CREATE POLICY "staff_read_customer_profiles" ON profiles
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admin_team_members tm
    WHERE tm.status = 'active'
      AND tm.role IN ('limited', 'support', 'viewer', 'full_access', 'finance', 'standard')
      AND (tm.auth_user_id = auth.uid() OR lower(tm.email) = lower(auth.jwt() ->> 'email'))
  )
  AND lower(coalesce(email, '')) NOT IN (SELECT lower(email) FROM admin_team_members WHERE email IS NOT NULL)
);

DROP POLICY IF EXISTS "staff_read_customer_invoices" ON invoices;
CREATE POLICY "staff_read_customer_invoices" ON invoices
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admin_team_members tm
    WHERE tm.status = 'active'
      AND tm.role IN ('support', 'finance', 'viewer', 'full_access', 'standard')
      AND (tm.auth_user_id = auth.uid() OR lower(tm.email) = lower(auth.jwt() ->> 'email'))
  )
);

DROP POLICY IF EXISTS "staff_read_customer_clients" ON clients;
CREATE POLICY "staff_read_customer_clients" ON clients
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admin_team_members tm
    WHERE tm.status = 'active'
      AND tm.role IN ('support', 'viewer', 'full_access', 'finance', 'standard')
      AND (tm.auth_user_id = auth.uid() OR lower(tm.email) = lower(auth.jwt() ->> 'email'))
  )
);
