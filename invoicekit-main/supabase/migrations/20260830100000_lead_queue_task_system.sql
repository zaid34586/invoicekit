-- Lead Queue task system.
--
-- Generic "work-a-list, mark each item red/orange/green" task type, usable
-- for anything: sales leads to convert, email-marketing recipients, lead
-- generation targets, etc. The item's fields are admin-defined per task
-- (queue_field_schema), so the same system works for very different lists
-- without new tables per task type.
--
-- Flow: admin creates a task with task_type = 'queue', defines what fields
-- each item has, and adds items. Staff opens the task full-screen, sees the
-- whole list (not hidden one-at-a-time), clicks an item to open its detail
-- panel, must attach proof (notes + screenshot/recording) before the
-- red/orange/green buttons unlock, and marks it. The item stays visible in
-- the list afterwards, just recolored.

-- 1. admin_tasks: task type + the field schema for queue items ------------
ALTER TABLE admin_tasks ADD COLUMN IF NOT EXISTS task_type text NOT NULL DEFAULT 'simple'
  CHECK (task_type IN ('simple', 'queue'));

ALTER TABLE admin_tasks ADD COLUMN IF NOT EXISTS queue_field_schema jsonb NOT NULL DEFAULT '[]'::jsonb;
-- shape: [{ "key": "name", "label": "Name" }, { "key": "phone", "label": "Phone" }, ...]

COMMENT ON COLUMN admin_tasks.task_type IS '''simple'' = the original single-task workflow. ''queue'' = a worked list of items (leads, recipients, targets...) each marked red/orange/green with proof.';
COMMENT ON COLUMN admin_tasks.queue_field_schema IS 'For task_type=queue: defines which fields each task_queue_items.data object has, and their display labels, in display order.';

-- 2. task_queue_items -------------------------------------------------------
CREATE TABLE IF NOT EXISTS task_queue_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES admin_tasks(id) ON DELETE CASCADE,
  data jsonb NOT NULL DEFAULT '{}'::jsonb, -- values matching the parent task's queue_field_schema keys
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'red', 'orange', 'green')),
  proof_notes text,
  proof_screenshot_url text,
  proof_recording_url text,
  marked_by uuid REFERENCES admin_team_members(id) ON DELETE SET NULL,
  marked_at timestamptz,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_queue_items_task_id ON task_queue_items(task_id);
CREATE INDEX IF NOT EXISTS idx_task_queue_items_status ON task_queue_items(task_id, status);

ALTER TABLE task_queue_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin full access task_queue_items" ON task_queue_items;
CREATE POLICY "admin full access task_queue_items" ON task_queue_items FOR ALL TO authenticated
USING (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com')
WITH CHECK (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');

DROP POLICY IF EXISTS "staff read own task_queue_items" ON task_queue_items;
CREATE POLICY "staff read own task_queue_items" ON task_queue_items FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admin_tasks t
    JOIN admin_team_members m ON m.id = t.assigned_to
    WHERE t.id = task_queue_items.task_id
      AND m.status = 'active'
      AND (m.auth_user_id = auth.uid() OR lower(m.email) = lower(auth.jwt() ->> 'email'))
  )
);

DROP POLICY IF EXISTS "staff update own task_queue_items" ON task_queue_items;
CREATE POLICY "staff update own task_queue_items" ON task_queue_items FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admin_tasks t
    JOIN admin_team_members m ON m.id = t.assigned_to
    WHERE t.id = task_queue_items.task_id
      AND m.status = 'active'
      AND (m.auth_user_id = auth.uid() OR lower(m.email) = lower(auth.jwt() ->> 'email'))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM admin_tasks t
    JOIN admin_team_members m ON m.id = t.assigned_to
    WHERE t.id = task_queue_items.task_id
      AND m.status = 'active'
      AND (m.auth_user_id = auth.uid() OR lower(m.email) = lower(auth.jwt() ->> 'email'))
  )
);

-- 3. task_sessions — one row per "Start" -> "End" work session on a queue task,
--    holds the screen recording for that whole session -------------------
CREATE TABLE IF NOT EXISTS task_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES admin_tasks(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES admin_team_members(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'recording' CHECK (status IN ('recording', 'completed', 'interrupted')),
  recording_url text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  items_worked integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_task_sessions_task_id ON task_sessions(task_id);

ALTER TABLE task_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin full access task_sessions" ON task_sessions;
CREATE POLICY "admin full access task_sessions" ON task_sessions FOR ALL TO authenticated
USING (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com')
WITH CHECK (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');

DROP POLICY IF EXISTS "staff manage own task_sessions" ON task_sessions;
CREATE POLICY "staff manage own task_sessions" ON task_sessions FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM admin_team_members m WHERE m.id = task_sessions.staff_id AND m.status = 'active' AND (m.auth_user_id = auth.uid() OR lower(m.email) = lower(auth.jwt() ->> 'email')))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM admin_team_members m WHERE m.id = task_sessions.staff_id AND m.status = 'active' AND (m.auth_user_id = auth.uid() OR lower(m.email) = lower(auth.jwt() ->> 'email')))
);

-- 4. task_activity_log — every tracked action, for the admin report -------
CREATE TABLE IF NOT EXISTS task_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES admin_tasks(id) ON DELETE CASCADE,
  queue_item_id uuid REFERENCES task_queue_items(id) ON DELETE SET NULL,
  session_id uuid REFERENCES task_sessions(id) ON DELETE SET NULL,
  staff_id uuid REFERENCES admin_team_members(id) ON DELETE SET NULL,
  action text NOT NULL, -- 'session_start' | 'session_end' | 'item_opened' | 'item_marked' | 'proof_uploaded'
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_activity_log_task_id ON task_activity_log(task_id, created_at);

ALTER TABLE task_activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin full access task_activity_log" ON task_activity_log;
CREATE POLICY "admin full access task_activity_log" ON task_activity_log FOR ALL TO authenticated
USING (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com')
WITH CHECK (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');

DROP POLICY IF EXISTS "staff insert own task_activity_log" ON task_activity_log;
CREATE POLICY "staff insert own task_activity_log" ON task_activity_log FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM admin_team_members m WHERE m.id = task_activity_log.staff_id AND m.status = 'active' AND (m.auth_user_id = auth.uid() OR lower(m.email) = lower(auth.jwt() ->> 'email')))
);

DROP POLICY IF EXISTS "staff read own task_activity_log" ON task_activity_log;
CREATE POLICY "staff read own task_activity_log" ON task_activity_log FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM admin_team_members m WHERE m.id = task_activity_log.staff_id AND m.status = 'active' AND (m.auth_user_id = auth.uid() OR lower(m.email) = lower(auth.jwt() ->> 'email')))
);

-- 5. Storage bucket for queue-item proof + session recordings -------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'task-session-recordings',
  'task-session-recordings',
  true,
  524288000, -- 500MB
  ARRAY['video/webm','video/mp4']
)
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 524288000, allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "staff upload session recordings" ON storage.objects;
CREATE POLICY "staff upload session recordings" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'task-session-recordings'
  AND (
    lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com'
    OR EXISTS (SELECT 1 FROM admin_team_members m WHERE m.status = 'active' AND (m.auth_user_id = auth.uid() OR lower(m.email) = lower(auth.jwt() ->> 'email')))
  )
);

DROP POLICY IF EXISTS "staff read session recordings" ON storage.objects;
CREATE POLICY "staff read session recordings" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'task-session-recordings');
