-- Content department + AI-verified task submission workflow.
--
-- 1) New "content" department (Content Creator team) — added the same way
--    Sales/Marketing/etc were added in 20260801130000, NOT as a new `role`.
--    `role` stays the permission tier (full_access/standard/limited/...);
--    `department` stays the team label. A content-creator hire is just a
--    `standard` role member with department = 'content'.
--
-- 2) admin_tasks gains an optional submission/verification workflow:
--    resources (brief attachments), a draft field, an AI verification
--    verdict, and proof-of-submission fields. All nullable/defaulted so
--    every existing task keeps working unchanged. requires_verification
--    is a per-task opt-in the admin sets when creating a task (used for
--    content tasks that need an AI check before they count as done).

-- 1. New department --------------------------------------------------------
INSERT INTO departments (slug, name, icon)
SELECT * FROM (VALUES
  ('content', 'Content Creator', '✍️')
) AS seed(slug, name, icon)
WHERE NOT EXISTS (SELECT 1 FROM departments WHERE departments.slug = seed.slug);

ALTER TABLE admin_tasks DROP CONSTRAINT IF EXISTS admin_tasks_department_check;
ALTER TABLE admin_tasks ADD CONSTRAINT admin_tasks_department_check
  CHECK (department IN ('general', 'support', 'finance', 'sales', 'engineering', 'marketing', 'hr', 'legal', 'content'));

-- 2. Task resources / draft / AI verification / submission proof -----------
-- AI verification uses Google Gemini's free-tier API (GEMINI_API_KEY
-- secret) via the verify-task-content edge function — no paid API needed.
ALTER TABLE admin_tasks ADD COLUMN IF NOT EXISTS resources jsonb NOT NULL DEFAULT '[]'::jsonb;
-- resources shape: [{ "label": "Brand guide", "url": "https://..." }, ...]

ALTER TABLE admin_tasks ADD COLUMN IF NOT EXISTS requires_verification boolean NOT NULL DEFAULT false;

ALTER TABLE admin_tasks ADD COLUMN IF NOT EXISTS draft_content text;

ALTER TABLE admin_tasks ADD COLUMN IF NOT EXISTS ai_verification_status text
  CHECK (ai_verification_status IN ('pending', 'pass', 'fail') OR ai_verification_status IS NULL);
ALTER TABLE admin_tasks ADD COLUMN IF NOT EXISTS ai_verification_feedback text;
ALTER TABLE admin_tasks ADD COLUMN IF NOT EXISTS ai_verified_at timestamptz;

ALTER TABLE admin_tasks ADD COLUMN IF NOT EXISTS submission_url text;
ALTER TABLE admin_tasks ADD COLUMN IF NOT EXISTS submission_screenshot_url text;
ALTER TABLE admin_tasks ADD COLUMN IF NOT EXISTS submission_notes text;
ALTER TABLE admin_tasks ADD COLUMN IF NOT EXISTS submitted_at timestamptz;

COMMENT ON COLUMN admin_tasks.resources IS 'Brief attachments/links given by admin at task creation (images, brand guidelines, references).';
COMMENT ON COLUMN admin_tasks.requires_verification IS 'When true, staff must submit draft_content and pass AI verification before the task can be marked done.';
COMMENT ON COLUMN admin_tasks.ai_verification_status IS 'Result of the last AI check on draft_content: pending while running, pass/fail after.';
