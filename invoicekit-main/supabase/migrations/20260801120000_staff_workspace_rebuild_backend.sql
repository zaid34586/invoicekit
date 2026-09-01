-- Staff Workspace rebuild -- part 1 (backend fixes).
--
-- Bug: StaffDashboard.tsx inserted directly into `notifications` with
-- audience='admin' whenever a staff member updated a task/ticket. RLS only
-- lets the owner INSERT directly (admin_manage_notifications), so every one
-- of those client-side inserts was silently rejected -- the admin never
-- found out a staff member had done anything. This RPC lets any active
-- staff member raise an admin-audience notification safely (SECURITY
-- DEFINER bypasses RLS, but only ever writes audience='admin').

CREATE OR REPLACE FUNCTION public.notify_admin(p_type text, p_title text, p_body text, p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admin_team_members
    WHERE status = 'active' AND (auth_user_id = auth.uid() OR lower(email) = lower(auth.jwt() ->> 'email'))
  ) THEN
    RAISE EXCEPTION 'Staff access required';
  END IF;

  INSERT INTO notifications (audience, type, title, body, metadata)
  VALUES ('admin', p_type, p_title, p_body, p_metadata);
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_admin(text, text, text, jsonb) TO authenticated;

-- SLA re-notify: was every 4 hours, which for an Urgent (2h SLA) item means
-- someone could go most of a day without a repeat nudge. Tighten to match
-- the design doc's "keeps reminding until resolved" intent -- urgent/high
-- re-notify hourly, medium every 4 hours (unchanged), low stays silent.
CREATE OR REPLACE FUNCTION public.run_sla_check()
RETURNS TABLE(processed integer, notified integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_processed int := 0;
  v_notified int := 0;
  v_row RECORD;
  v_threshold numeric;
  v_hours numeric;
  v_should_notify boolean;
  v_renotify_interval interval;
  v_has_active_role boolean;
BEGIN
  FOR v_row IN
    SELECT id, priority, assigned_to, created_at, sla_last_notified_at, subject
    FROM admin_support_tickets
    WHERE status NOT IN ('resolved', 'closed')
  LOOP
    v_processed := v_processed + 1;
    v_threshold := CASE v_row.priority WHEN 'urgent' THEN 2 WHEN 'high' THEN 8 WHEN 'medium' THEN 24 ELSE 72 END;
    v_hours := EXTRACT(EPOCH FROM (now() - v_row.created_at)) / 3600.0;
    IF v_hours < v_threshold THEN CONTINUE; END IF;

    v_renotify_interval := CASE v_row.priority WHEN 'urgent' THEN interval '1 hour' WHEN 'high' THEN interval '1 hour' ELSE interval '4 hours' END;
    v_should_notify := v_row.priority <> 'low'
      AND (v_row.sla_last_notified_at IS NULL OR v_row.sla_last_notified_at < now() - v_renotify_interval);

    UPDATE admin_support_tickets
      SET sla_breached = true,
          sla_last_notified_at = CASE WHEN v_should_notify THEN now() ELSE sla_last_notified_at END
      WHERE id = v_row.id;

    IF v_should_notify THEN
      INSERT INTO notifications (audience, recipient_team_member_id, type, title, body, metadata)
      VALUES ('staff', v_row.assigned_to, 'sla_breach', 'SLA breached: ' || v_row.subject,
        initcap(v_row.priority) || ' priority ticket is past its SLA target. Please resolve or reassign.', jsonb_build_object('ticket_id', v_row.id, 'priority', v_row.priority));

      -- Escalate to the whole Full Access role for urgent items, AND
      -- specifically to the owner (admin audience) if nobody in the
      -- assigned staff's role is even active right now.
      IF v_row.priority = 'urgent' THEN
        INSERT INTO notifications (audience, role, type, title, body, metadata)
        VALUES ('staff', 'full_access', 'sla_breach', 'URGENT SLA breach: ' || v_row.subject,
          'No one has resolved this in time. Reassignment may be needed.', jsonb_build_object('ticket_id', v_row.id));

        SELECT EXISTS (
          SELECT 1 FROM admin_team_members WHERE status = 'active' AND role IN ('support','finance','full_access')
        ) INTO v_has_active_role;

        IF NOT v_has_active_role OR v_row.assigned_to IS NULL THEN
          PERFORM public.notify_admin(
            'sla_breach_no_staff',
            'No staff available -- urgent ticket unresolved: ' || v_row.subject,
            'This urgent ticket has breached SLA and no active staff member is assigned or available.',
            jsonb_build_object('ticket_id', v_row.id)
          );
        END IF;
      END IF;

      INSERT INTO admin_audit_logs (action, target_type, target_id, details)
      VALUES ('ticket.auto_escalated', 'ticket', v_row.id::text, jsonb_build_object('reason', 'sla_breach', 'priority', v_row.priority));
      v_notified := v_notified + 1;
    END IF;
  END LOOP;

  FOR v_row IN
    SELECT id, priority, assigned_to, created_at, sla_last_notified_at, title
    FROM admin_tasks
    WHERE status <> 'done'
  LOOP
    v_processed := v_processed + 1;
    v_threshold := CASE v_row.priority WHEN 'urgent' THEN 2 WHEN 'high' THEN 8 WHEN 'medium' THEN 24 ELSE 72 END;
    v_hours := EXTRACT(EPOCH FROM (now() - v_row.created_at)) / 3600.0;
    IF v_hours < v_threshold THEN CONTINUE; END IF;

    v_renotify_interval := CASE v_row.priority WHEN 'urgent' THEN interval '1 hour' WHEN 'high' THEN interval '1 hour' ELSE interval '4 hours' END;
    v_should_notify := v_row.priority <> 'low'
      AND (v_row.sla_last_notified_at IS NULL OR v_row.sla_last_notified_at < now() - v_renotify_interval);

    UPDATE admin_tasks
      SET sla_breached = true,
          sla_last_notified_at = CASE WHEN v_should_notify THEN now() ELSE sla_last_notified_at END
      WHERE id = v_row.id;

    IF v_should_notify THEN
      INSERT INTO notifications (audience, recipient_team_member_id, type, title, body, metadata)
      VALUES ('staff', v_row.assigned_to, 'sla_breach', 'SLA breached: ' || v_row.title,
        initcap(v_row.priority) || ' priority task is past its SLA target.', jsonb_build_object('task_id', v_row.id, 'priority', v_row.priority));

      IF v_row.priority = 'urgent' THEN
        INSERT INTO notifications (audience, role, type, title, body, metadata)
        VALUES ('staff', 'full_access', 'sla_breach', 'URGENT SLA breach: ' || v_row.title,
          'No one has resolved this in time. Reassignment may be needed.', jsonb_build_object('task_id', v_row.id));
        IF v_row.assigned_to IS NULL THEN
          PERFORM public.notify_admin('sla_breach_no_staff', 'No staff available -- urgent task unresolved: ' || v_row.title,
            'This urgent task has breached SLA with nobody assigned.', jsonb_build_object('task_id', v_row.id));
        END IF;
      END IF;

      INSERT INTO admin_audit_logs (action, target_type, target_id, details)
      VALUES ('task.auto_escalated', 'task', v_row.id::text, jsonb_build_object('reason', 'sla_breach', 'priority', v_row.priority));
      v_notified := v_notified + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_processed, v_notified;
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_sla_check() TO authenticated, service_role;
