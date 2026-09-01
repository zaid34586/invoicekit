-- Maintenance Mode / Public Signup / other platform toggles in Admin ->
-- Settings were saveable but never actually enforced anywhere in the
-- customer-facing app, because the only SELECT policy on
-- admin_system_settings restricted reads to the owner's own account. The
-- customer app (an ordinary authenticated user, or an anonymous visitor)
-- could never even read these flags to act on them.
--
-- These are feature flags, not secrets -- safe to expose for read. Writes
-- remain owner-only via the existing "admin_manage_system_settings" policy.

DROP POLICY IF EXISTS "public_read_system_settings" ON admin_system_settings;
CREATE POLICY "public_read_system_settings" ON admin_system_settings
  FOR SELECT TO anon, authenticated
  USING (true);
