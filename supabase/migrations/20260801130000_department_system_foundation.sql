-- Fresh rebuild — Phase 1 (backend foundation): Role vs Department split.
--
-- Root problem: "role" was doing two jobs at once -- permission tier
-- (full_access/limited/viewer) AND team/category (support/finance). Adding
-- Marketing, Sales, Engineering, HR, Legal the old way would mean hardcoding
-- a new role everywhere (RLS, assignment engine, staffPermissions.ts) -- the
-- opposite of "add a department without touching code" that a growing
-- business needs.
--
-- Fix, done additively so nothing already working breaks:
--   - `departments` is now the real, editable list of teams (7 seeded).
--   - `admin_team_members.department` (text slug, references departments.slug)
--     is the new source of truth for "which team". `role` becomes purely the
--     permission tier going forward. Existing support/finance staff are
--     backfilled with a matching department AND keep their existing role
--     value -- zero behavior change for anyone already set up.
--   - A new tier, 'standard', is added for future department hires who
--     aren't Full Access/Limited/Viewer (old support/finance rows are left
--     exactly as they are -- this is additive, not a migration of existing
--     rows' role value).
--   - assignment_rules gets optional target_department/fallback_department
--     columns. Old role-based rules keep working unchanged; new rules can
--     target a department instead. pick_assignee_by_department() is a new,
--     separate function -- the existing pick_assignee(role[]) is untouched.

-- 1. departments -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  icon text NOT NULL DEFAULT '📋',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "everyone_read_active_departments" ON departments;
DROP POLICY IF EXISTS "admin_manage_departments" ON departments;
CREATE POLICY "everyone_read_active_departments" ON departments FOR SELECT TO authenticated USING (is_active);
CREATE POLICY "admin_manage_departments" ON departments FOR ALL
  TO authenticated USING (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com')
  WITH CHECK (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');

INSERT INTO departments (slug, name, icon)
SELECT * FROM (VALUES
  ('support', 'Support', '🎧'),
  ('finance', 'Finance', '💰'),
  ('marketing', 'Marketing', '📣'),
  ('sales', 'Sales / Promotion', '📈'),
  ('engineering', 'Engineering', '⚙️'),
  ('hr', 'HR', '👤'),
  ('legal', 'Legal / Compliance', '⚖️'),
  ('general', 'General', '📋')
) AS seed(slug, name, icon)
WHERE NOT EXISTS (SELECT 1 FROM departments WHERE departments.slug = seed.slug);

-- 2. admin_team_members: department column + wider tier ---------------------
ALTER TABLE admin_team_members ADD COLUMN IF NOT EXISTS department text REFERENCES departments(slug);

UPDATE admin_team_members SET department = 'support' WHERE role = 'support' AND department IS NULL;
UPDATE admin_team_members SET department = 'finance' WHERE role = 'finance' AND department IS NULL;

ALTER TABLE admin_team_members DROP CONSTRAINT IF EXISTS admin_team_members_role_check;
ALTER TABLE admin_team_members ADD CONSTRAINT admin_team_members_role_check
  CHECK (role IN ('full_access', 'standard', 'limited', 'support', 'finance', 'viewer'));

-- notifications.role needs to accept the same widened set (used to target a
-- whole tier, e.g. "everyone on full_access").
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_role_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_role_check
  CHECK (role IN ('full_access', 'standard', 'limited', 'support', 'finance', 'viewer') OR role IS NULL);

-- 3. admin_tasks.department: widen to the new department slugs --------------
ALTER TABLE admin_tasks DROP CONSTRAINT IF EXISTS admin_tasks_department_check;
ALTER TABLE admin_tasks ADD CONSTRAINT admin_tasks_department_check
  CHECK (department IN ('general', 'support', 'finance', 'sales', 'engineering', 'marketing', 'hr', 'legal'));

-- 4. assignment_rules: optional department targeting ------------------------
ALTER TABLE assignment_rules ADD COLUMN IF NOT EXISTS target_department text REFERENCES departments(slug);
ALTER TABLE assignment_rules ADD COLUMN IF NOT EXISTS fallback_department text REFERENCES departments(slug);

-- Starter rules for the new departments (keyword-based, tickets) -- inactive
-- by default until there's actually a staff member in that department, so
-- they don't silently vanish tickets into a department nobody's watching.
INSERT INTO assignment_rules (name, is_active, trigger_type, match_value, target_role, fallback_role, target_department, fallback_department, priority)
SELECT * FROM (VALUES
  ('Sales/lead keywords -> Sales', false, 'keyword', 'demo,lead,partnership,pricing call,quote', 'full_access', 'full_access', 'sales', 'support', 'medium'),
  ('Marketing keywords -> Marketing', false, 'keyword', 'campaign,newsletter,social media,seo,press', 'full_access', 'full_access', 'marketing', 'support', 'low')
) AS seed(name, is_active, trigger_type, match_value, target_role, fallback_role, target_department, fallback_department, priority)
WHERE NOT EXISTS (SELECT 1 FROM assignment_rules WHERE assignment_rules.name = seed.name);

-- 5. Department-based pickAssignee (separate from the existing
--    pick_assignee(role[]) so nothing already wired to it changes behavior).
CREATE OR REPLACE FUNCTION public.pick_assignee_by_department(p_department text, p_fallback_department text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT m.id INTO v_id
  FROM admin_team_members m
  WHERE m.status = 'active'
    AND m.department = p_department
    AND m.role NOT IN ('limited', 'viewer')
  ORDER BY
    (
      COALESCE((SELECT COUNT(*) FROM admin_tasks t WHERE t.assigned_to = m.id AND t.status IN ('pending','in_progress','blocked')), 0)
      + COALESCE((SELECT COUNT(*) FROM admin_support_tickets s WHERE s.assigned_to = m.id AND s.status NOT IN ('resolved','closed')), 0)
    ) ASC,
    COALESCE(m.last_assigned_at, 'epoch'::timestamptz) ASC
  LIMIT 1;

  IF v_id IS NULL AND p_fallback_department IS NOT NULL THEN
    RETURN public.pick_assignee_by_department(p_fallback_department, NULL);
  END IF;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pick_assignee_by_department(text, text) TO authenticated;

-- 6. Widen RLS additively so a new 'standard' tier staff member (in any
--    department) can see/act on items assigned to them -- item-level access
--    (assigned_to = me) always works regardless of department, per the
--    "workspace access overrides dashboard access" rule.
DROP POLICY IF EXISTS "staff_read_assigned_tickets" ON admin_support_tickets;
CREATE POLICY "staff_read_assigned_tickets" ON admin_support_tickets
FOR SELECT TO authenticated
USING (
  assigned_to IS NULL
  OR assigned_to IN (
    SELECT id FROM admin_team_members
    WHERE status = 'active' AND (auth_user_id = auth.uid() OR lower(email) = lower(auth.jwt() ->> 'email'))
  )
);

DROP POLICY IF EXISTS "staff_update_assigned_tickets" ON admin_support_tickets;
CREATE POLICY "staff_update_assigned_tickets" ON admin_support_tickets
FOR UPDATE TO authenticated
USING (assigned_to IN (SELECT id FROM admin_team_members WHERE status = 'active' AND (auth_user_id = auth.uid() OR lower(email) = lower(auth.jwt() ->> 'email'))))
WITH CHECK (assigned_to IN (SELECT id FROM admin_team_members WHERE status = 'active' AND (auth_user_id = auth.uid() OR lower(email) = lower(auth.jwt() ->> 'email'))));

DROP POLICY IF EXISTS "staff_read_assigned_tasks" ON admin_tasks;
CREATE POLICY "staff_read_assigned_tasks" ON admin_tasks
FOR SELECT TO authenticated
USING (
  assigned_to IS NULL
  OR assigned_to IN (SELECT id FROM admin_team_members WHERE status = 'active' AND (auth_user_id = auth.uid() OR lower(email) = lower(auth.jwt() ->> 'email')))
);

DROP POLICY IF EXISTS "staff_update_assigned_tasks" ON admin_tasks;
CREATE POLICY "staff_update_assigned_tasks" ON admin_tasks
FOR UPDATE TO authenticated
USING (assigned_to IN (SELECT id FROM admin_team_members WHERE status = 'active' AND (auth_user_id = auth.uid() OR lower(email) = lower(auth.jwt() ->> 'email'))))
WITH CHECK (assigned_to IN (SELECT id FROM admin_team_members WHERE status = 'active' AND (auth_user_id = auth.uid() OR lower(email) = lower(auth.jwt() ->> 'email'))));

DROP POLICY IF EXISTS "staff_read_own_ticket_messages" ON support_ticket_messages;
CREATE POLICY "staff_read_own_ticket_messages" ON support_ticket_messages
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM admin_support_tickets t
  JOIN admin_team_members m ON m.id = t.assigned_to
  WHERE t.id = support_ticket_messages.ticket_id
    AND m.status = 'active'
    AND (m.auth_user_id = auth.uid() OR lower(m.email) = lower(auth.jwt() ->> 'email'))
));

DROP POLICY IF EXISTS "staff_add_own_ticket_messages" ON support_ticket_messages;
CREATE POLICY "staff_add_own_ticket_messages" ON support_ticket_messages
FOR INSERT TO authenticated
WITH CHECK (
  author_user_id = auth.uid() AND author_type = 'staff'
  AND EXISTS (
    SELECT 1 FROM admin_support_tickets t
    JOIN admin_team_members m ON m.id = t.assigned_to
    WHERE t.id = support_ticket_messages.ticket_id
      AND m.status = 'active'
      AND (m.auth_user_id = auth.uid() OR lower(m.email) = lower(auth.jwt() ->> 'email'))
  )
);
