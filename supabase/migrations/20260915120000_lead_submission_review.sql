-- Lead document submission & admin verification for queue tasks.
--
-- Interns who research leads (queue tasks with a target count) now prepare
-- the collected leads as a document (PDF / DOC / Excel / CSV), upload it, and
-- submit it for verification. Admin reviews the file and marks the submission
-- verified or rejected (with feedback). A separate table keeps the full
-- submission history (resubmission after rejection = new row) without
-- widening admin_tasks RLS for staff.

-- 1. task-attachments bucket: allow document formats + larger files ---------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'task-attachments',
  'task-attachments',
  true,
  26214400, -- 25MB
  ARRAY[
    'image/png','image/jpeg','image/webp','image/gif','application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 26214400,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. task_lead_submissions ----------------------------------------------------
CREATE TABLE IF NOT EXISTS task_lead_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES admin_tasks(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES admin_team_members(id) ON DELETE SET NULL,
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_type text,
  notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  feedback text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_lead_submissions_task_id ON task_lead_submissions(task_id);

ALTER TABLE task_lead_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin full access task_lead_submissions" ON task_lead_submissions;
CREATE POLICY "admin full access task_lead_submissions" ON task_lead_submissions FOR ALL TO authenticated
USING (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com')
WITH CHECK (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');

-- Staff can add a submission to a task assigned to them
DROP POLICY IF EXISTS "staff insert own task_lead_submissions" ON task_lead_submissions;
CREATE POLICY "staff insert own task_lead_submissions" ON task_lead_submissions FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM admin_tasks t
    JOIN admin_team_members m ON m.id = t.assigned_to
    WHERE t.id = task_lead_submissions.task_id
      AND m.status = 'active'
      AND (m.auth_user_id = auth.uid() OR lower(m.email) = lower(auth.jwt() ->> 'email'))
  )
);

-- Staff can read the submissions (incl. admin feedback) for their own task
DROP POLICY IF EXISTS "staff read own task_lead_submissions" ON task_lead_submissions;
CREATE POLICY "staff read own task_lead_submissions" ON task_lead_submissions FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admin_tasks t
    JOIN admin_team_members m ON m.id = t.assigned_to
    WHERE t.id = task_lead_submissions.task_id
      AND m.status = 'active'
      AND (m.auth_user_id = auth.uid() OR lower(m.email) = lower(auth.jwt() ->> 'email'))
  )
);
