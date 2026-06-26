-- Drop the SELECT policy on the logos bucket entirely.
-- Public buckets serve objects via public URLs without needing a SELECT policy.
-- Removing it eliminates the "broad SELECT policy" scanner finding while
-- preserving direct object URL access for <img> tags and PDF generation.
DROP POLICY IF EXISTS "auth_read_own_logos" ON storage.objects;
DROP POLICY IF EXISTS "public_read_logos" ON storage.objects;
