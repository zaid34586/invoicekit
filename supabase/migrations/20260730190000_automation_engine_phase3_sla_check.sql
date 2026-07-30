-- Automation Engine Phase 3: SLA breach detection + escalation.
--
-- Table 4 of the design doc (Urgent 2h / High 8h / Medium 24h / Low 72h) was
-- only ever a client-side countdown (see `sla()` in AdminSupportCenter.tsx) --
-- nothing fired if nobody had the tab open. This adds a server-side check:
--   * run_sla_check() scans every open task + ticket, compares age vs the
--     priority threshold, and for anything breached (urgent/high/medium)
--     inserts a real notification -- reusing the `notifications` table that
--     StaffDashboard/StaffLayout already subscribe to over realtime with a
--     sound (2026-07-30 migration), so staff get pinged with zero new
--     frontend code.
--   * Urgent breaches additionally broadcast to the whole Full Access role
--     (design doc: "Turant Full Access ko notify + reassign option").
--   * Low priority breaches are flagged (sla_breached=true) for the
--     dashboard to highlight, but do NOT spam a notification -- matches the
--     doc's "no notification spam" for Low.
--   * Re-notifies at most once every 4 hours per item, so it can't spam.
--
-- This does not force a reassignment -- it notifies + logs, matching
-- "reassign OPTION" language in the doc; Section 5 (Manual Override) stays
-- the human's call.

ALTER TABLE admin_support_tickets ADD COLUMN IF NOT EXISTS sla_breached boolean NOT NULL DEFAULT false;
ALTER TABLE admin_support_tickets ADD COLUMN IF NOT EXISTS sla_last_notified_at timestamptz;
ALTER TABLE admin_tasks ADD COLUMN IF NOT EXISTS sla_breached boolean NOT NULL DEFAULT false;
ALTER TABLE admin_tasks ADD COLUMN IF NOT EXISTS sla_last_notified_at timestamptz;

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
BEGIN
  -- Tickets ------------------------------------------------------------
  FOR v_row IN
    SELECT id, priority, assigned_to, created_at, sla_last_notified_at, subject
    FROM admin_support_tickets
    WHERE status NOT IN ('resolved', 'closed')
  LOOP
    v_processed := v_processed + 1;
    v_threshold := CASE v_row.priority WHEN 'urgent' THEN 2 WHEN 'high' THEN 8 WHEN 'medium' THEN 24 ELSE 72 END;
    v_hours := EXTRACT(EPOCH FROM (now() - v_row.created_at)) / 3600.0;
    IF v_hours < v_threshold THEN CONTINUE; END IF;

    v_should_notify := v_row.priority <> 'low'
      AND (v_row.sla_last_notified_at IS NULL OR v_row.sla_last_notified_at < now() - interval '4 hours');

    UPDATE admin_support_tickets
      SET sla_breached = true,
          sla_last_notified_at = CASE WHEN v_should_notify THEN now() ELSE sla_last_notified_at END
      WHERE id = v_row.id;

    IF v_should_notify THEN
      INSERT INTO notifications (audience, recipient_team_member_id, type, title, body, metadata)
      VALUES ('staff', v_row.assigned_to, 'sla_breach', 'SLA breached: ' || v_row.subject,
        initcap(v_row.priority) || ' priority ticket is past its SLA target.', jsonb_build_object('ticket_id', v_row.id, 'priority', v_row.priority));

      IF v_row.priority = 'urgent' THEN
        INSERT INTO notifications (audience, role, type, title, body, metadata)
        VALUES ('staff', 'full_access', 'sla_breach', 'URGENT SLA breach: ' || v_row.subject,
          'No one has resolved this in time. Reassignment may be needed.', jsonb_build_object('ticket_id', v_row.id));
      END IF;

      INSERT INTO admin_audit_logs (action, target_type, target_id, details)
      VALUES ('ticket.auto_escalated', 'ticket', v_row.id::text, jsonb_build_object('reason', 'sla_breach', 'priority', v_row.priority));
      v_notified := v_notified + 1;
    END IF;
  END LOOP;

  -- Tasks ----------------------------------------------------------------
  FOR v_row IN
    SELECT id, priority, assigned_to, created_at, sla_last_notified_at, title
    FROM admin_tasks
    WHERE status <> 'done'
  LOOP
    v_processed := v_processed + 1;
    v_threshold := CASE v_row.priority WHEN 'urgent' THEN 2 WHEN 'high' THEN 8 WHEN 'medium' THEN 24 ELSE 72 END;
    v_hours := EXTRACT(EPOCH FROM (now() - v_row.created_at)) / 3600.0;
    IF v_hours < v_threshold THEN CONTINUE; END IF;

    v_should_notify := v_row.priority <> 'low'
      AND (v_row.sla_last_notified_at IS NULL OR v_row.sla_last_notified_at < now() - interval '4 hours');

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

-- Best-effort: if pg_cron is enabled on this project (Supabase Dashboard ->
-- Database -> Extensions -> pg_cron), schedule it to run every 15 minutes.
-- If it isn't enabled yet, this just logs a notice and does nothing else --
-- it will NOT fail the migration. Use the separate sla-monitor edge function
-- (deployed alongside this migration) as the alternative if you'd rather
-- trigger it from the same external cron you already use for
-- invoice-automation / subscription-automation.
DO $$
BEGIN
  BEGIN
    PERFORM cron.schedule('sla-check-every-15-min', '*/15 * * * *', 'select public.run_sla_check();');
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron not available/enabled yet -- enable it in Supabase Dashboard > Database > Extensions, then re-run: select cron.schedule(''sla-check-every-15-min'', ''*/15 * * * *'', ''select public.run_sla_check();''); OR use the sla-monitor edge function with your existing external cron instead.';
  END;
END $$;
