-- Staff workflow actions.
-- Adds task progress/staff notes and allows active staff to update assigned work only.

ALTER TABLE admin_tasks ADD COLUMN IF NOT EXISTS progress integer NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100);
ALTER TABLE admin_tasks ADD COLUMN IF NOT EXISTS staff_notes text;
ALTER TABLE admin_tasks ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE admin_tasks ADD COLUMN IF NOT EXISTS last_staff_update timestamptz;

ALTER TABLE admin_support_tickets ADD COLUMN IF NOT EXISTS staff_notes text;
ALTER TABLE admin_support_tickets ADD COLUMN IF NOT EXISTS last_staff_update timestamptz;
ALTER TABLE admin_support_tickets ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

DROP POLICY IF EXISTS "staff_update_assigned_tasks" ON admin_tasks;
DROP POLICY IF EXISTS "staff_update_assigned_tickets" ON admin_support_tickets;

CREATE POLICY "staff_update_assigned_tasks" ON admin_tasks
FOR UPDATE TO authenticated
USING (
  assigned_to IN (
    SELECT id
    FROM admin_team_members
    WHERE status = 'active'
      AND role IN ('limited', 'support', 'finance', 'full_access')
      AND (auth_user_id = auth.uid() OR lower(email) = lower(auth.jwt() ->> 'email'))
  )
)
WITH CHECK (
  assigned_to IN (
    SELECT id
    FROM admin_team_members
    WHERE status = 'active'
      AND role IN ('limited', 'support', 'finance', 'full_access')
      AND (auth_user_id = auth.uid() OR lower(email) = lower(auth.jwt() ->> 'email'))
  )
);

CREATE POLICY "staff_update_assigned_tickets" ON admin_support_tickets
FOR UPDATE TO authenticated
USING (
  assigned_to IN (
    SELECT id
    FROM admin_team_members
    WHERE status = 'active'
      AND role IN ('limited', 'support', 'full_access')
      AND (auth_user_id = auth.uid() OR lower(email) = lower(auth.jwt() ->> 'email'))
  )
)
WITH CHECK (
  assigned_to IN (
    SELECT id
    FROM admin_team_members
    WHERE status = 'active'
      AND role IN ('limited', 'support', 'full_access')
      AND (auth_user_id = auth.uid() OR lower(email) = lower(auth.jwt() ->> 'email'))
  )
);

CREATE INDEX IF NOT EXISTS idx_admin_tasks_last_staff_update ON admin_tasks(last_staff_update DESC);
CREATE INDEX IF NOT EXISTS idx_admin_support_last_staff_update ON admin_support_tickets(last_staff_update DESC);
