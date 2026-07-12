-- InvoiceKit System & Security Center
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS admin_security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (event_type IN ('login','logout','failed_login','password_reset','force_logout','session_expired','permission_denied','security_alert')),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  portal text NOT NULL DEFAULT 'admin' CHECK (portal IN ('admin','staff','customer','system')),
  ip_address text,
  user_agent text,
  device_label text,
  status text NOT NULL DEFAULT 'info' CHECK (status IN ('info','success','warning','critical')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_active_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  portal text NOT NULL DEFAULT 'customer' CHECK (portal IN ('admin','staff','customer')),
  device_label text,
  ip_address text,
  user_agent text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  force_logout boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_system_health_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name text NOT NULL,
  status text NOT NULL DEFAULT 'unknown' CHECK (status IN ('operational','degraded','down','unknown')),
  latency_ms integer,
  checked_at timestamptz NOT NULL DEFAULT now(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE admin_security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_active_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_system_health_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_manage_security_events" ON admin_security_events;
DROP POLICY IF EXISTS "owner_manage_active_sessions" ON admin_active_sessions;
DROP POLICY IF EXISTS "owner_manage_system_health" ON admin_system_health_checks;

CREATE POLICY "owner_manage_security_events" ON admin_security_events FOR ALL
  TO authenticated
  USING (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com')
  WITH CHECK (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');

CREATE POLICY "owner_manage_active_sessions" ON admin_active_sessions FOR ALL
  TO authenticated
  USING (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com')
  WITH CHECK (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');

CREATE POLICY "owner_manage_system_health" ON admin_system_health_checks FOR ALL
  TO authenticated
  USING (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com')
  WITH CHECK (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');

CREATE INDEX IF NOT EXISTS idx_admin_security_events_created_at ON admin_security_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_security_events_type ON admin_security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_admin_active_sessions_user_id ON admin_active_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_active_sessions_last_seen ON admin_active_sessions(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_system_health_service ON admin_system_health_checks(service_name, checked_at DESC);
