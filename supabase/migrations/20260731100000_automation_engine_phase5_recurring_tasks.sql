-- Automation Engine Phase 5: recurring/scheduled tasks.
--
-- The design doc's Table 1 included "Weekly/monthly recurring (cron)" tasks
-- (weekly revenue report, monthly reconciliation), and assignment_rules even
-- reserved a trigger_type='schedule' for this -- but nothing ever actually
-- created these tasks. This adds a small templates table + a function that's
-- idempotent per day (safe to call from cron every few minutes without
-- creating duplicates), reusing the same admin_tasks auto-assignment from
-- Phase 1 (department set, assigned_to left null -> picked automatically).

CREATE TABLE IF NOT EXISTS recurring_task_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  department text NOT NULL DEFAULT 'general' CHECK (department IN ('general','support','finance','sales','engineering')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  frequency text NOT NULL CHECK (frequency IN ('daily','weekly','monthly')),
  day_of_week integer CHECK (day_of_week BETWEEN 0 AND 6),   -- 0=Sunday, used when frequency='weekly'
  day_of_month integer CHECK (day_of_month BETWEEN 1 AND 28), -- used when frequency='monthly' (capped at 28 so it always exists)
  is_active boolean NOT NULL DEFAULT true,
  last_run_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE recurring_task_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_manage_recurring_task_templates" ON recurring_task_templates;
CREATE POLICY "admin_manage_recurring_task_templates" ON recurring_task_templates FOR ALL
  TO authenticated USING (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com')
  WITH CHECK (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');

INSERT INTO recurring_task_templates (title, description, department, priority, frequency, day_of_week)
SELECT 'Weekly revenue report', 'Pull this week''s revenue/churn numbers and share the summary.', 'finance', 'medium', 'weekly', 1 -- Monday
WHERE NOT EXISTS (SELECT 1 FROM recurring_task_templates WHERE title = 'Weekly revenue report');

INSERT INTO recurring_task_templates (title, description, department, priority, frequency, day_of_month)
SELECT 'Monthly reconciliation', 'Reconcile last month''s invoices, payments and refunds against the ledger.', 'finance', 'medium', 'monthly', 1
WHERE NOT EXISTS (SELECT 1 FROM recurring_task_templates WHERE title = 'Monthly reconciliation');

CREATE OR REPLACE FUNCTION public.run_recurring_tasks()
RETURNS TABLE(created integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created int := 0;
  v_row RECORD;
  v_today date := current_date;
  v_should_fire boolean;
BEGIN
  FOR v_row IN SELECT * FROM recurring_task_templates WHERE is_active LOOP
    IF v_row.last_run_date = v_today THEN
      CONTINUE; -- already ran today, stay idempotent
    END IF;

    v_should_fire := CASE v_row.frequency
      WHEN 'daily' THEN true
      WHEN 'weekly' THEN extract(dow FROM v_today)::int = v_row.day_of_week
      WHEN 'monthly' THEN extract(day FROM v_today)::int = v_row.day_of_month
      ELSE false
    END;

    IF v_should_fire THEN
      INSERT INTO admin_tasks (title, description, department, priority, origin, source_ref, due_date)
      VALUES (
        v_row.title || ' — ' || to_char(v_today, 'DD Mon YYYY'),
        v_row.description,
        v_row.department, v_row.priority, 'auto',
        'recurring:' || v_row.id::text || ':' || v_today::text,
        v_today + 2
      )
      ON CONFLICT (source_ref) WHERE source_ref IS NOT NULL AND status IN ('pending','in_progress','blocked') DO NOTHING;

      UPDATE recurring_task_templates SET last_run_date = v_today WHERE id = v_row.id;

      INSERT INTO admin_audit_logs (action, target_type, target_id, details)
      VALUES ('task.auto_created', 'recurring_template', v_row.id::text, jsonb_build_object('reason', 'recurring_schedule', 'title', v_row.title));

      v_created := v_created + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_created;
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_recurring_tasks() TO authenticated, service_role;

-- Best-effort daily pg_cron schedule (same pattern/caveats as Phase 3's SLA
-- check -- silently does nothing if pg_cron isn't enabled on this project).
DO $$
BEGIN
  BEGIN
    PERFORM cron.schedule('recurring-tasks-daily', '5 9 * * *', 'select public.run_recurring_tasks();');
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron not available/enabled yet -- the sla-monitor edge function has been updated to also call run_recurring_tasks() on every run, so your existing external cron (if any) covers this automatically.';
  END;
END $$;
