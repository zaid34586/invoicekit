-- Enterprise notifications + activity center foundation.
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audience text NOT NULL DEFAULT 'staff' CHECK (audience IN ('admin','staff','user','all')),
  recipient_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_team_member_id uuid REFERENCES admin_team_members(id) ON DELETE CASCADE,
  role text CHECK (role IN ('full_access','limited','support','finance','viewer')),
  type text NOT NULL DEFAULT 'system',
  title text NOT NULL,
  body text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_manage_notifications" ON notifications;
DROP POLICY IF EXISTS "staff_read_own_notifications" ON notifications;
DROP POLICY IF EXISTS "staff_update_own_notifications" ON notifications;

CREATE POLICY "admin_manage_notifications" ON notifications FOR ALL
  TO authenticated
  USING (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com')
  WITH CHECK (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');

CREATE POLICY "staff_read_own_notifications" ON notifications FOR SELECT
  TO authenticated
  USING (
    audience IN ('staff','all')
    AND EXISTS (
      SELECT 1 FROM admin_team_members tm
      WHERE tm.status = 'active'
        AND (tm.auth_user_id = auth.uid() OR lower(tm.email) = lower(auth.jwt() ->> 'email'))
        AND (
          notifications.recipient_team_member_id IS NULL
          OR notifications.recipient_team_member_id = tm.id
          OR notifications.role = tm.role
        )
    )
  );

CREATE POLICY "staff_update_own_notifications" ON notifications FOR UPDATE
  TO authenticated
  USING (
    audience IN ('staff','all')
    AND EXISTS (
      SELECT 1 FROM admin_team_members tm
      WHERE tm.status = 'active'
        AND (tm.auth_user_id = auth.uid() OR lower(tm.email) = lower(auth.jwt() ->> 'email'))
        AND (
          notifications.recipient_team_member_id IS NULL
          OR notifications.recipient_team_member_id = tm.id
          OR notifications.role = tm.role
        )
    )
  )
  WITH CHECK (
    audience IN ('staff','all')
    AND EXISTS (
      SELECT 1 FROM admin_team_members tm
      WHERE tm.status = 'active'
        AND (tm.auth_user_id = auth.uid() OR lower(tm.email) = lower(auth.jwt() ->> 'email'))
        AND (
          notifications.recipient_team_member_id IS NULL
          OR notifications.recipient_team_member_id = tm.id
          OR notifications.role = tm.role
        )
    )
  );

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_team ON notifications(recipient_team_member_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_audience_role ON notifications(audience, role, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
