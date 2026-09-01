-- Fresh rebuild — Phase 1b: task auto-assignment now picks by department
-- directly (pick_assignee_by_department), not just the old role-based
-- lookup. Since 20260801130000 already backfilled `department` for every
-- existing support/finance staff member, this is a pure upgrade — those
-- departments keep routing exactly as before, and Marketing/Sales/
-- Engineering/HR/Legal now actually work the same way instead of silently
-- having no real picking logic.

CREATE OR REPLACE FUNCTION public.trg_auto_assign_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pick uuid;
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_pick := public.pick_assignee_by_department(NEW.department, 'general');

  IF v_pick IS NULL THEN
    -- Nobody in that department (or general) is active -> escalate to
    -- whoever has the Full Access tier, same safety net as before.
    v_pick := public.pick_assignee(ARRAY['full_access']);
    INSERT INTO admin_audit_logs (action, target_type, target_id, details)
    VALUES ('task.auto_escalated', 'task', NEW.id::text,
      jsonb_build_object('reason', 'no active staff in department', 'department', NEW.department));
  END IF;

  IF v_pick IS NOT NULL THEN
    NEW.assigned_to := v_pick;
    NEW.origin := 'auto';
    UPDATE admin_team_members SET last_assigned_at = now() WHERE id = v_pick;
    INSERT INTO admin_audit_logs (action, target_type, target_id, details)
    VALUES ('task.auto_assigned', 'task', NEW.id::text,
      jsonb_build_object('assigned_to', v_pick, 'department', NEW.department, 'reason', 'department match + least open items'));
  END IF;

  RETURN NEW;
END;
$$;
