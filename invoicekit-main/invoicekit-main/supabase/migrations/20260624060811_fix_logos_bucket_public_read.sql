-- Drop the overly-permissive public SELECT policy that allows listing all logos
DROP POLICY IF EXISTS "public_read_logos" ON storage.objects;

-- Replace with a policy that only allows authenticated users to read their own folder
CREATE POLICY "auth_read_own_logos" ON storage.objects FOR SELECT
  TO authenticated USING (
    bucket_id = 'logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
