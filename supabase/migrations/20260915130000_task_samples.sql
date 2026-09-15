-- Sample / example files for queue tasks.
--
-- Admin can attach sample/example files (a filled-in Excel, a sample PDF, a
-- reference document...) to a task so the intern sees exactly what format the
-- prepared lead document should look like when they open the task. Stored as
-- JSONB on the admin_tasks row itself (no new table / no new RLS) because
-- staff already read their own assigned task rows.

ALTER TABLE admin_tasks ADD COLUMN IF NOT EXISTS sample_files jsonb NOT NULL DEFAULT '[]'::jsonb;
COMMENT ON COLUMN admin_tasks.sample_files IS 'Array of { url, name, type } — admin-provided sample/example attachments shown to the intern when they open the task.';
