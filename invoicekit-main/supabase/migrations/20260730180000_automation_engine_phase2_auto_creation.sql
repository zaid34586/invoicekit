-- Automation Engine Phase 2: auto-CREATION from system events.
--
-- Phase 1 (20260730170000) added real auto-ASSIGNMENT. This adds the other
-- half from the design doc (Section 1): the system creating tasks/tickets by
-- itself, with no human action, for:
--   * failed payment            -> Task, Finance, high
--   * refund event               -> Ticket, Finance, high
--   * subscription cancelled     -> Task, Support, low
--   * invoice overdue reminder   -> Task, Support (medium) -> escalates to
--                                   Finance (high) if it fires again for the
--                                   same invoice while still open
--
-- Hook points were chosen deliberately to avoid touching any webhook/edge
-- function code (lemon-webhook, paddle-webhook, stripe-invoice-payments,
-- invoice-automation):
--   * billing_events        -- already written reliably by every payment
--                               provider webhook (upsert on provider_event_id)
--   * subscriptions          -- already upserted by the same webhooks
--   * automation_runs        -- already written by the invoice-automation
--                               function every time an overdue reminder email
--                               is actually sent to a client
-- New rows created here are auto-assigned by the Phase 1 trigger the moment
-- they're inserted with assigned_to left null -- no duplicate logic needed.

-- 1. Dedupe support: one open auto-task/ticket per source event -------------
ALTER TABLE admin_tasks ADD COLUMN IF NOT EXISTS source_ref text;
ALTER TABLE admin_support_tickets ADD COLUMN IF NOT EXISTS source_ref text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_tasks_source_ref_open
  ON admin_tasks(source_ref)
  WHERE source_ref IS NOT NULL AND status IN ('pending','in_progress','blocked');
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_support_tickets_source_ref_open
  ON admin_support_tickets(source_ref)
  WHERE source_ref IS NOT NULL AND status IN ('open','pending','in_progress');

-- 2. billing_events -> failed payment (task) / refund (ticket) --------------
CREATE OR REPLACE FUNCTION public.trg_billing_event_automation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  SELECT customer_email INTO v_email FROM subscriptions WHERE user_id = NEW.user_id;
  v_email := coalesce(v_email, NEW.user_id::text);

  IF NEW.event_name ILIKE '%payment_failed%' OR NEW.status = 'failed' THEN
    INSERT INTO admin_tasks (title, description, department, priority, origin, source_ref, due_date)
    VALUES (
      'Follow up: failed payment — ' || v_email,
      'Auto-created from billing event "' || NEW.event_name || '" (order ' || coalesce(NEW.order_id, '-') || ', ' || coalesce(NEW.currency,'') || ' ' || coalesce(NEW.amount::text,'0') || ').',
      'finance', 'high', 'auto', 'billing_event:' || NEW.id::text, current_date + 1
    )
    ON CONFLICT (source_ref) WHERE source_ref IS NOT NULL AND status IN ('pending','in_progress','blocked') DO NOTHING;

    INSERT INTO admin_audit_logs (action, target_type, target_id, details)
    VALUES ('task.auto_created', 'billing_event', NEW.id::text, jsonb_build_object('reason', 'payment_failed', 'user_id', NEW.user_id));

  ELSIF NEW.event_name ILIKE '%refund%' OR NEW.status = 'refunded' THEN
    INSERT INTO admin_support_tickets (subject, message, priority, origin, source_ref, user_id)
    VALUES (
      'Refund request — ' || v_email,
      'Auto-created from billing event "' || NEW.event_name || '" (order ' || coalesce(NEW.order_id, '-') || ', ' || coalesce(NEW.currency,'') || ' ' || coalesce(NEW.amount::text,'0') || ').',
      'high', 'auto', 'billing_event:' || NEW.id::text, NEW.user_id
    )
    ON CONFLICT (source_ref) WHERE source_ref IS NOT NULL AND status IN ('open','pending','in_progress') DO NOTHING;

    INSERT INTO admin_audit_logs (action, target_type, target_id, details)
    VALUES ('ticket.auto_created', 'billing_event', NEW.id::text, jsonb_build_object('reason', 'refund', 'user_id', NEW.user_id));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS billing_event_automation_trigger ON billing_events;
CREATE TRIGGER billing_event_automation_trigger
  AFTER INSERT ON billing_events
  FOR EACH ROW EXECUTE FUNCTION public.trg_billing_event_automation();

-- 3. subscriptions -> cancellation / churn follow-up (task) -----------------
CREATE OR REPLACE FUNCTION public.trg_subscription_churn_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.cancelled = true AND coalesce(OLD.cancelled, false) = false THEN
    INSERT INTO admin_tasks (title, description, department, priority, origin, source_ref)
    VALUES (
      'Cancellation follow-up — ' || coalesce(NEW.customer_email, NEW.user_id::text),
      'Subscription cancelled (plan: ' || coalesce(NEW.plan, '-') || ').',
      'support', 'low', 'auto', 'subscription_churn:' || NEW.user_id::text
    )
    ON CONFLICT (source_ref) WHERE source_ref IS NOT NULL AND status IN ('pending','in_progress','blocked') DO NOTHING;

    INSERT INTO admin_audit_logs (action, target_type, target_id, details)
    VALUES ('task.auto_created', 'subscription', NEW.user_id::text, jsonb_build_object('reason', 'subscription_cancelled'));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS subscription_churn_task_trigger ON subscriptions;
CREATE TRIGGER subscription_churn_task_trigger
  AFTER UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.trg_subscription_churn_task();

-- 4. automation_runs -> overdue invoice follow-up, escalating on repeat -----
-- Note: "automation_rules" here is the pre-existing invoice-reminder table
-- (event_type: due_reminder/overdue_reminder/payment_thank_you) -- unrelated
-- to Phase 1's "assignment_rules". We only read its event_type column.
CREATE OR REPLACE FUNCTION public.trg_invoice_overdue_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_type text;
  v_invoice_number text;
  v_existing_id uuid;
  v_pick uuid;
BEGIN
  IF NEW.invoice_id IS NULL OR NEW.status NOT IN ('sent', 'simulated') THEN
    RETURN NEW;
  END IF;

  SELECT event_type INTO v_event_type FROM automation_rules WHERE id = NEW.rule_id;
  IF v_event_type IS DISTINCT FROM 'overdue_reminder' THEN
    RETURN NEW;
  END IF;

  SELECT invoice_number INTO v_invoice_number FROM invoices WHERE id = NEW.invoice_id;
  v_invoice_number := coalesce(v_invoice_number, NEW.invoice_id::text);

  SELECT id INTO v_existing_id FROM admin_tasks
    WHERE source_ref = 'invoice_overdue:' || NEW.invoice_id::text
      AND status IN ('pending','in_progress','blocked')
    LIMIT 1;

  IF v_existing_id IS NULL THEN
    INSERT INTO admin_tasks (title, description, department, priority, origin, source_ref)
    VALUES (
      'Overdue follow-up — Invoice ' || v_invoice_number,
      'Auto-created: overdue reminder email was sent to the client for this invoice.',
      'support', 'medium', 'auto', 'invoice_overdue:' || NEW.invoice_id::text
    )
    ON CONFLICT (source_ref) WHERE source_ref IS NOT NULL AND status IN ('pending','in_progress','blocked') DO NOTHING;

    INSERT INTO admin_audit_logs (action, target_type, target_id, details)
    VALUES ('task.auto_created', 'invoice', NEW.invoice_id::text, jsonb_build_object('reason', 'invoice_overdue'));
  ELSE
    -- Second (or later) overdue reminder for the same still-open invoice ->
    -- escalate: bump to Finance + high priority, per the design doc's
    -- "Medium -> High" progression, and re-run the assignment engine.
    v_pick := public.pick_assignee(ARRAY['finance', 'full_access']);
    UPDATE admin_tasks
      SET priority = 'high',
          department = 'finance',
          assigned_to = coalesce(v_pick, assigned_to)
      WHERE id = v_existing_id AND priority <> 'high';

    INSERT INTO admin_audit_logs (action, target_type, target_id, details)
    VALUES ('task.auto_escalated', 'invoice', NEW.invoice_id::text, jsonb_build_object('reason', 'repeat overdue reminder', 'task_id', v_existing_id));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoice_overdue_task_trigger ON automation_runs;
CREATE TRIGGER invoice_overdue_task_trigger
  AFTER INSERT ON automation_runs
  FOR EACH ROW EXECUTE FUNCTION public.trg_invoice_overdue_task();

CREATE INDEX IF NOT EXISTS idx_admin_tasks_source_ref ON admin_tasks(source_ref);
CREATE INDEX IF NOT EXISTS idx_admin_support_tickets_source_ref ON admin_support_tickets(source_ref);
