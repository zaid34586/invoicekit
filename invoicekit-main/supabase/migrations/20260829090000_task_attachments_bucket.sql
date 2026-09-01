-- task-attachments storage bucket.
--
-- Lets Admin attach real files (images, PDFs, brand guides) to a task's
-- `resources`, and lets staff attach a real screenshot/proof file when
-- submitting a task, instead of only pasting an external URL. Public bucket
-- (like brand-assets) so the resulting URL can be stored directly on
-- admin_tasks.resources / submission_screenshot_url and opened without a
-- signed-URL round trip. Upload/delete is restricted to active staff
-- (admin_team_members) — read is public since these are internal work
-- files, not customer data.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'task-attachments',
  'task-attachments',
  true,
  10485760,
  ARRAY['image/png','image/jpeg','image/webp','image/gif','application/pdf']
)
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 10485760, allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "staff upload task attachments" ON storage.objects;
CREATE POLICY "staff upload task attachments" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'task-attachments'
  AND (
    lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com'
    OR EXISTS (SELECT 1 FROM admin_team_members m WHERE m.status = 'active' AND (m.auth_user_id = auth.uid() OR lower(m.email) = lower(auth.jwt() ->> 'email')))
  )
);

DROP POLICY IF EXISTS "staff read task attachments" ON storage.objects;
CREATE POLICY "staff read task attachments" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'task-attachments');

DROP POLICY IF EXISTS "staff delete own task attachments" ON storage.objects;
CREATE POLICY "staff delete own task attachments" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'task-attachments'
  AND (
    lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com'
    OR EXISTS (SELECT 1 FROM admin_team_members m WHERE m.status = 'active' AND (m.auth_user_id = auth.uid() OR lower(m.email) = lower(auth.jwt() ->> 'email')))
  )
);
