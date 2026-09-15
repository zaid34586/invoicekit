-- Task "submitted / under review" status for queue tasks.
--
-- When the intern submits their lead document for verification, the task
-- moves to 'submitted' (Under Review): the intern's side closes (read-only),
-- and the admin reviews the uploaded file. Verify -> 'done', reject -> back
-- to 'in_progress' (intern fixes and resubmits).

ALTER TABLE admin_tasks DROP CONSTRAINT IF EXISTS admin_tasks_status_check;
ALTER TABLE admin_tasks ADD CONSTRAINT admin_tasks_status_check
  CHECK (status IN ('pending', 'in_progress', 'done', 'blocked', 'submitted'));

COMMENT ON COLUMN admin_tasks.status IS 'pending=assigned, in_progress=working, submitted=lead document sent for admin review, blocked=needs help, done=verified/complete.';
