-- InvoiceKit Admin Phase 7: system center settings.
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS admin_system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_system_settings" ON admin_system_settings;
DROP POLICY IF EXISTS "admin_manage_system_settings" ON admin_system_settings;

CREATE POLICY "admin_read_system_settings" ON admin_system_settings FOR SELECT
  TO authenticated USING (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');

CREATE POLICY "admin_manage_system_settings" ON admin_system_settings FOR ALL
  TO authenticated USING (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com')
  WITH CHECK (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');

INSERT INTO admin_system_settings (key, value)
VALUES (
  'platform',
  '{
    "maintenance_mode": false,
    "maintenance_message": "We are improving InvoiceKit. Please check back soon.",
    "allow_admin_bypass": true,
    "public_signup": true,
    "invoice_sharing": true,
    "credits_system": true,
    "team_portal": false,
    "ai_insights": true,
    "ads_enabled": false,
    "default_currency": "INR",
    "security_level": "standard"
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;
