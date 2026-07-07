-- SECURITY FIX: the previous "public_share_invoice" / "public_share_profile"
-- policies used `share_token IS NOT NULL` as the condition. That does NOT
-- check the token the caller actually supplied — it just checks that the
-- ROW has any share token set. Since the anon/public Supabase key is always
-- present in frontend JS, anyone could run:
--
--   supabase.from('invoices').select('*')
--
-- and get back EVERY shared invoice from EVERY user (name, amounts, address,
-- tax ID, etc), not just the one invoice matching a link they were given.
-- Same problem on `profiles` (leaked every business's full profile that had
-- at least one shared invoice).
--
-- An earlier attempt (see 20260625153947) tried to check the token via
-- `current_setting('request.share_token', true)`, but nothing in the app
-- ever actually SET that session variable per-request, so it always
-- evaluated to NULL and blocked every legitimate share link too — which is
-- why it was "simplified" down to `share_token IS NOT NULL`, silently
-- reintroducing the leak.
--
-- Fix: remove public SELECT access to these tables entirely. Public share
-- links now go through two SECURITY DEFINER functions that take the exact
-- token as a parameter and can only ever return the single row matching it.
-- There is no way to scan/list rows through these functions, and a
-- crypto.randomUUID() token (122 bits of randomness) cannot be brute-forced.

DROP POLICY IF EXISTS "public_share_invoice" ON invoices;
DROP POLICY IF EXISTS "public_share_profile" ON profiles;

CREATE OR REPLACE FUNCTION get_shared_invoice(p_token text)
RETURNS SETOF invoices
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT *
  FROM invoices
  WHERE share_token IS NOT NULL
    AND share_token = p_token;
$$;

CREATE OR REPLACE FUNCTION get_shared_invoice_profile(p_token text)
RETURNS SETOF profiles
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT p.*
  FROM profiles p
  JOIN invoices i ON i.user_id = p.user_id
  WHERE i.share_token IS NOT NULL
    AND i.share_token = p_token;
$$;

-- Only these two entry points are exposed publicly — never the raw tables.
REVOKE ALL ON FUNCTION get_shared_invoice(text) FROM public;
REVOKE ALL ON FUNCTION get_shared_invoice_profile(text) FROM public;
GRANT EXECUTE ON FUNCTION get_shared_invoice(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_shared_invoice_profile(text) TO anon, authenticated;
