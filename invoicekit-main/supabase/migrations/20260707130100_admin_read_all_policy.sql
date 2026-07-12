-- Admin.tsx checks `user.email === 'admin@invoicekit.app'` in the UI, but
-- that's a client-side check only — it does NOT change what rows Supabase
-- actually returns. The admin page queries `profiles`/`invoices` with the
-- normal client, so without a matching RLS policy, the standard "own rows
-- only" policy applies to the admin too, and the dashboard silently shows
-- only the admin's own single account instead of all users.
--
-- This adds a read-only bypass for exactly one, fixed email address (taken
-- from the verified JWT issued by Supabase Auth — not something a client
-- can forge) so the admin dashboard can see all users' data. It does not
-- grant INSERT/UPDATE/DELETE — the admin panel is read-only by design.

CREATE POLICY "admin_read_all_profiles" ON profiles FOR SELECT
  TO authenticated
  USING (auth.jwt() ->> 'email' = 'admin@invoicekit.app');

CREATE POLICY "admin_read_all_invoices" ON invoices FOR SELECT
  TO authenticated
  USING (auth.jwt() ->> 'email' = 'admin@invoicekit.app');
