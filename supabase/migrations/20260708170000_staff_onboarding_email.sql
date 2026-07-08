-- Staff onboarding email + subdomain metadata.
-- Safe to run multiple times.

ALTER TABLE admin_team_members ADD COLUMN IF NOT EXISTS invite_status text DEFAULT 'not_configured';
ALTER TABLE admin_team_members ADD COLUMN IF NOT EXISTS invite_email_sent_at timestamptz;
ALTER TABLE admin_team_members ADD COLUMN IF NOT EXISTS invite_error text;
ALTER TABLE admin_team_members ADD COLUMN IF NOT EXISTS staff_portal_url text DEFAULT 'https://staff.invoicekit.com';
ALTER TABLE admin_team_members ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;
ALTER TABLE admin_team_members ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'admin_team_members_invite_status_check'
  ) THEN
    ALTER TABLE admin_team_members
      ADD CONSTRAINT admin_team_members_invite_status_check
      CHECK (invite_status IN ('sent','failed','not_configured'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_admin_team_members_invite_status ON admin_team_members(invite_status);
CREATE INDEX IF NOT EXISTS idx_admin_team_members_email ON admin_team_members(lower(email));
