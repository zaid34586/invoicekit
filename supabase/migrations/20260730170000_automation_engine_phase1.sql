-- Automation Engine Phase 1: "rules are data, not code" + real auto-assignment.
--
-- Context: admin_suggest_assignee() (2026-07-29) already does keyword/department
-- routing + load-balance, but only as a *suggestion* the admin has to click.
-- Tickets can still sit unassigned until someone opens them. This migration:
--   1. Adds automation_rules as a real data table (keyword + department rules),
--      matching the design doc's "rule: {trigger_type, match, target_role,
--      fallback_role, priority}" shape.
--   2. Adds origin + rule_id to admin_tasks / admin_support_tickets so every
--      row can be traced back to "manual" vs "auto" vs which rule fired.
--   3. Adds a real BEFORE INSERT trigger on admin_support_tickets that assigns
--      automatically (keyword match -> role -> least-open-items -> round robin
--      tie-break), with a fallback to full_access + an audit note if nobody in
--      the target role is active. This does NOT touch payment/invoice webhooks
--      (auto-*creation* from billing events is a separate, later migration --
--      see Section 1 of the design doc -- kept out of this pass on purpose).
--   4. Same trigger shape added to admin_tasks as a safety net only: it fires
--      *only* if a task is inserted with assigned_to still null (today the
--      Admin UI always sets it, so this changes no existing behaviour; it
--      just means nothing can slip through unassigned in the future, e.g.
--      once an "Automation Rules" screen lets non-dev people create tasks).
--   5. Every auto decision is written to admin_audit_logs (already existed),
--      action = 'ticket.auto_assigned' / 'task.auto_assigned' / '*.auto_escalated'.

-- 1. automation_rules -------------------------------------------------------
CREATE TABLE IF NOT EXISTS automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  trigger_type text NOT NULL CHECK (trigger_type IN ('keyword','department','event','schedule')),
  match_value text NOT NULL,      -- comma-separated keywords, or a department name, or an event/cron key
  target_role text NOT NULL CHECK (target_role IN ('support','finance','full_access','limited')),
  fallback_role text NOT NULL DEFAULT 'full_access' CHECK (fallback_role IN ('support','finance','full_access','limited')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_read_all_automation_rules" ON automation_rules;
DROP POLICY IF EXISTS "admin_manage_automation_rules" ON automation_rules;
CREATE POLICY "admin_read_all_automation_rules" ON automation_rules FOR SELECT
  TO authenticated USING (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');
CREATE POLICY "admin_manage_automation_rules" ON automation_rules FOR ALL
  TO authenticated USING (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com')
  WITH CHECK (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');

-- Seed the same routing admin_suggest_assignee() already used, now as data.
INSERT INTO automation_rules (name, trigger_type, match_value, target_role, fallback_role, priority)
SELECT * FROM (VALUES
  ('Billing/refund keywords -> Finance', 'keyword', 'refund,billing,payment,charge,invoice,subscription,price,receipt', 'finance', 'full_access', 'high'),
  ('Default ticket keywords -> Support', 'keyword', 'login,error,bug,not working,how to,help,issue,broken', 'support', 'full_access', 'medium'),
  ('Support department -> Support', 'department', 'support', 'support', 'full_access', 'medium'),
  ('Finance department -> Finance', 'department', 'finance', 'finance', 'full_access', 'medium'),
  ('Sales department -> Full Access', 'department', 'sales', 'full_access', 'limited', 'medium'),
  ('Engineering department -> Full Access', 'department', 'engineering', 'full_access', 'limited', 'medium'),
  ('General department -> Full Access', 'department', 'general', 'full_access', 'limited', 'low')
) AS seed(name, trigger_type, match_value, target_role, fallback_role, priority)
WHERE NOT EXISTS (SELECT 1 FROM automation_rules);

CREATE INDEX IF NOT EXISTS idx_automation_rules_active_type ON automation_rules(is_active, trigger_type);

-- 2. Traceability columns -----------------------------------------------------
ALTER TABLE admin_support_tickets ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','auto','chat'));
ALTER TABLE admin_support_tickets ADD COLUMN IF NOT EXISTS rule_id uuid REFERENCES automation_rules(id) ON DELETE SET NULL;
ALTER TABLE admin_tasks ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','auto','chat'));
ALTER TABLE admin_tasks ADD COLUMN IF NOT EXISTS rule_id uuid REFERENCES automation_rules(id) ON DELETE SET NULL;

-- Round-robin tie-breaker: "assigned longest ago wins" when open-item counts tie.
ALTER TABLE admin_team_members ADD COLUMN IF NOT EXISTS last_assigned_at timestamptz;

-- 3. Core engine: pickAssignee(role[]) ---------------------------------------
CREATE OR REPLACE FUNCTION public.pick_assignee(p_target_roles text[])
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
    AND m.role = ANY(p_target_roles)
    AND m.role <> 'viewer'
    AND m.role <> 'limited'   -- limited staff are never an auto-engine target (per design doc section 2)
  ORDER BY
    array_position(p_target_roles, m.role) ASC,
    (
      COALESCE((SELECT COUNT(*) FROM admin_tasks t WHERE t.assigned_to = m.id AND t.status IN ('pending','in_progress','blocked')), 0)
      + COALESCE((SELECT COUNT(*) FROM admin_support_tickets s WHERE s.assigned_to = m.id AND s.status NOT IN ('resolved','closed')), 0)
    ) ASC,
    COALESCE(m.last_assigned_at, 'epoch'::timestamptz) ASC
  LIMIT 1;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.pick_assignee(text[]) TO authenticated;

-- Keyword match against active automation_rules (replaces the hardcoded regex
-- that used to live inside admin_suggest_assignee -- rules are data now).
CREATE OR REPLACE FUNCTION public.resolve_ticket_rule(p_text text)
RETURNS automation_rules
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_haystack text := lower(coalesce(p_text, ''));
  v_rule automation_rules%ROWTYPE;
BEGIN
  FOR v_rule IN
    SELECT * FROM automation_rules
    WHERE is_active AND trigger_type = 'keyword'
    ORDER BY created_at ASC
  LOOP
    IF EXISTS (
      SELECT 1 FROM unnest(string_to_array(v_rule.match_value, ',')) AS kw
      WHERE v_haystack LIKE '%' || trim(kw) || '%'
    ) THEN
      RETURN v_rule;
    END IF;
  END LOOP;
  -- No keyword rule matched -> fall back to the default Support rule if seeded.
  SELECT * INTO v_rule FROM automation_rules
    WHERE is_active AND trigger_type = 'keyword' AND target_role = 'support'
    ORDER BY created_at ASC LIMIT 1;
  RETURN v_rule;
END;
$$;
GRANT EXECUTE ON FUNCTION public.resolve_ticket_rule(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_department_rule(p_department text)
RETURNS automation_rules
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM automation_rules
  WHERE is_active AND trigger_type = 'department' AND match_value = coalesce(p_department, 'general')
  ORDER BY created_at ASC LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.resolve_department_rule(text) TO authenticated;

-- 4. Trigger: real auto-assignment on ticket creation -------------------------
CREATE OR REPLACE FUNCTION public.trg_auto_assign_ticket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule automation_rules;
  v_pick uuid;
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN
    RETURN NEW; -- someone already picked an assignee explicitly, don't override
  END IF;

  v_rule := public.resolve_ticket_rule(coalesce(NEW.subject, '') || ' ' || coalesce(NEW.message, ''));

  IF v_rule.id IS NOT NULL THEN
    v_pick := public.pick_assignee(ARRAY[v_rule.target_role, v_rule.fallback_role]);
  ELSE
    v_pick := public.pick_assignee(ARRAY['support', 'full_access']);
  END IF;

  IF v_pick IS NULL THEN
    -- Nobody active in the target/fallback roles at all -> escalate to Full Access.
    v_pick := public.pick_assignee(ARRAY['full_access']);
    INSERT INTO admin_audit_logs (action, target_type, target_id, details)
    VALUES ('ticket.auto_escalated', 'ticket', NEW.id::text,
      jsonb_build_object('reason', 'no active staff in target role', 'rule_id', v_rule.id));
  END IF;

  IF v_pick IS NOT NULL THEN
    NEW.assigned_to := v_pick;
    NEW.origin := 'auto';
    NEW.rule_id := v_rule.id;
    UPDATE admin_team_members SET last_assigned_at = now() WHERE id = v_pick;
    INSERT INTO admin_audit_logs (action, target_type, target_id, details)
    VALUES ('ticket.auto_assigned', 'ticket', NEW.id::text,
      jsonb_build_object('assigned_to', v_pick, 'rule_id', v_rule.id, 'reason', 'keyword match + least open items'));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_assign_ticket_trigger ON admin_support_tickets;
CREATE TRIGGER auto_assign_ticket_trigger
  BEFORE INSERT ON admin_support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.trg_auto_assign_ticket();

-- 5. Safety-net trigger for tasks (fires only if assigned_to was left null) --
CREATE OR REPLACE FUNCTION public.trg_auto_assign_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule automation_rules;
  v_pick uuid;
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_rule := public.resolve_department_rule(NEW.department);
  IF v_rule.id IS NOT NULL THEN
    v_pick := public.pick_assignee(ARRAY[v_rule.target_role, v_rule.fallback_role]);
  ELSE
    v_pick := public.pick_assignee(ARRAY['full_access', 'limited']);
  END IF;

  IF v_pick IS NULL THEN
    v_pick := public.pick_assignee(ARRAY['full_access']);
    INSERT INTO admin_audit_logs (action, target_type, target_id, details)
    VALUES ('task.auto_escalated', 'task', NEW.id::text,
      jsonb_build_object('reason', 'no active staff in target role', 'rule_id', v_rule.id));
  END IF;

  IF v_pick IS NOT NULL THEN
    NEW.assigned_to := v_pick;
    NEW.origin := 'auto';
    NEW.rule_id := v_rule.id;
    UPDATE admin_team_members SET last_assigned_at = now() WHERE id = v_pick;
    INSERT INTO admin_audit_logs (action, target_type, target_id, details)
    VALUES ('task.auto_assigned', 'task', NEW.id::text,
      jsonb_build_object('assigned_to', v_pick, 'rule_id', v_rule.id, 'reason', 'department match + least open items'));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_assign_task_trigger ON admin_tasks;
CREATE TRIGGER auto_assign_task_trigger
  BEFORE INSERT ON admin_tasks
  FOR EACH ROW EXECUTE FUNCTION public.trg_auto_assign_task();

CREATE INDEX IF NOT EXISTS idx_admin_support_tickets_origin ON admin_support_tickets(origin);
CREATE INDEX IF NOT EXISTS idx_admin_tasks_origin ON admin_tasks(origin);
