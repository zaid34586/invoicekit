-- Intern lead submission: interns researching leads need to ADD new items to
-- their own assigned queue tasks (not just mark admin-pre-filled ones), plus a
-- per-task target count so completion can be tracked against "get 50 leads".

-- 1. admin_tasks: optional target number of items for queue tasks -----------
ALTER TABLE admin_tasks ADD COLUMN IF NOT EXISTS queue_target_count integer;
COMMENT ON COLUMN admin_tasks.queue_target_count IS 'For task_type=queue: optional target number of items the assignee must research and add (e.g. 50).';

-- 2. Staff can insert new queue items into tasks assigned to them -----------
DROP POLICY IF EXISTS "staff insert own task_queue_items" ON task_queue_items;
CREATE POLICY "staff insert own task_queue_items" ON task_queue_items FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM admin_tasks t
    JOIN admin_team_members m ON m.id = t.assigned_to
    WHERE t.id = task_queue_items.task_id
      AND m.status = 'active'
      AND (m.auth_user_id = auth.uid() OR lower(m.email) = lower(auth.jwt() ->> 'email'))
  )
);
