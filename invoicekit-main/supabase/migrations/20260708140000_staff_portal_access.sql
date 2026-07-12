-- Staff portal access policies.
-- Allows active team members to read only the rows needed for /staff portal.
-- Owner admin policies remain separate and unchanged.

ALTER TABLE admin_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_finance_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_read_own_team_member" ON admin_team_members;
DROP POLICY IF EXISTS "staff_read_assigned_tasks" ON admin_tasks;
DROP POLICY IF EXISTS "staff_read_assigned_tickets" ON admin_support_tickets;
DROP POLICY IF EXISTS "staff_finance_read_entries" ON admin_finance_entries;

CREATE POLICY "staff_read_own_team_member" ON admin_team_members
FOR SELECT TO authenticated
USING (
  status = 'active'
  AND (
    auth_user_id = auth.uid()
    OR lower(email) = lower(auth.jwt() ->> 'email')
  )
);

CREATE POLICY "staff_read_assigned_tasks" ON admin_tasks
FOR SELECT TO authenticated
USING (
  assigned_to IS NULL
  OR assigned_to IN (
    SELECT id
    FROM admin_team_members
    WHERE status = 'active'
      AND (auth_user_id = auth.uid() OR lower(email) = lower(auth.jwt() ->> 'email'))
  )
);

CREATE POLICY "staff_read_assigned_tickets" ON admin_support_tickets
FOR SELECT TO authenticated
USING (
  assigned_to IS NULL
  OR assigned_to IN (
    SELECT id
    FROM admin_team_members
    WHERE status = 'active'
      AND role IN ('support', 'limited', 'full_access')
      AND (auth_user_id = auth.uid() OR lower(email) = lower(auth.jwt() ->> 'email'))
  )
);

CREATE POLICY "staff_finance_read_entries" ON admin_finance_entries
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM admin_team_members
    WHERE status = 'active'
      AND role IN ('finance', 'full_access')
      AND (auth_user_id = auth.uid() OR lower(email) = lower(auth.jwt() ->> 'email'))
  )
);
