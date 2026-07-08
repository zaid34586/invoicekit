-- InvoiceKit auth hardening helpers. Safe to run multiple times.
-- Keeps ban/credits/pro fields available even if old admin migrations were skipped.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ban_reason text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banned_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS credits integer NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS free_pro_until timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS admin_notes text;

CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email_lower ON profiles(lower(email));
CREATE INDEX IF NOT EXISTS idx_profiles_is_banned ON profiles(is_banned);

CREATE TABLE IF NOT EXISTS admin_auth_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text,
  event text NOT NULL CHECK (event IN ('login','logout','blocked_banned','profile_created','profile_loaded')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_auth_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_auth_events" ON admin_auth_events;
DROP POLICY IF EXISTS "admin_insert_auth_events" ON admin_auth_events;

CREATE POLICY "admin_read_auth_events" ON admin_auth_events FOR SELECT
  TO authenticated USING (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');

CREATE POLICY "admin_insert_auth_events" ON admin_auth_events FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_admin_auth_events_created_at ON admin_auth_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_auth_events_email ON admin_auth_events(lower(email));
