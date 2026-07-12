-- Staff customer workspace read access.
-- Lets active staff roles with user access view basic customer context.
-- Admin-only actions (ban, delete, invoice balance, pro plan) remain unavailable from the staff UI.

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_read_customer_profiles" ON profiles;
DROP POLICY IF EXISTS "staff_read_customer_invoices" ON invoices;
DROP POLICY IF EXISTS "staff_read_customer_clients" ON clients;

CREATE POLICY "staff_read_customer_profiles" ON profiles
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM admin_team_members tm
    WHERE tm.status = 'active'
      AND tm.role IN ('limited', 'support', 'viewer', 'full_access')
      AND (tm.auth_user_id = auth.uid() OR lower(tm.email) = lower(auth.jwt() ->> 'email'))
  )
  AND lower(coalesce(email, '')) NOT IN (
    SELECT lower(email) FROM admin_team_members WHERE email IS NOT NULL
  )
);

CREATE POLICY "staff_read_customer_invoices" ON invoices
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM admin_team_members tm
    WHERE tm.status = 'active'
      AND tm.role IN ('support', 'finance', 'viewer', 'full_access')
      AND (tm.auth_user_id = auth.uid() OR lower(tm.email) = lower(auth.jwt() ->> 'email'))
  )
);

CREATE POLICY "staff_read_customer_clients" ON clients
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM admin_team_members tm
    WHERE tm.status = 'active'
      AND tm.role IN ('support', 'viewer', 'full_access')
      AND (tm.auth_user_id = auth.uid() OR lower(tm.email) = lower(auth.jwt() ->> 'email'))
  )
);
