-- Fresh rebuild — Phase 2a: Ticket Lifecycle state machine (design doc
-- Section 9). Implemented as DB triggers rather than app code so it's
-- consistent no matter which screen (Admin's AdminSupportCenter, Staff's
-- new workspace, or a future channel) sends the reply -- one source of
-- truth, can't drift out of sync between UIs.
--
-- States: new -> assigned -> in_progress -> waiting_customer -> resolved ->
-- closed, with reopened -> back to the same assignee if the customer
-- replies after resolve/close. ("new"/"assigned" map to the existing
-- 'open'/'pending' values already used everywhere -- not renamed, to avoid
-- a risky mass-rename across every screen that already reads that column.)

ALTER TABLE admin_support_tickets DROP CONSTRAINT IF EXISTS admin_support_tickets_status_check;
ALTER TABLE admin_support_tickets ADD CONSTRAINT admin_support_tickets_status_check
  CHECK (status IN ('open','in_progress','waiting_customer','pending','resolved','closed','reopened'));

ALTER TABLE admin_support_tickets ADD COLUMN IF NOT EXISTS assigned_at timestamptz;
ALTER TABLE admin_support_tickets ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE admin_support_tickets ADD COLUMN IF NOT EXISTS reopened_at timestamptz;
ALTER TABLE admin_support_tickets ADD COLUMN IF NOT EXISTS closed_at timestamptz;

-- assigned_at: stamped the moment assigned_to is first set (auto or manual).
CREATE OR REPLACE FUNCTION public.trg_ticket_assigned_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to) THEN
    NEW.assigned_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ticket_assigned_at_trigger ON admin_support_tickets;
CREATE TRIGGER ticket_assigned_at_trigger
  BEFORE INSERT OR UPDATE OF assigned_to ON admin_support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.trg_ticket_assigned_at();

-- started_at + closed_at: stamped on the matching status transition.
CREATE OR REPLACE FUNCTION public.trg_ticket_status_timestamps()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'in_progress' AND OLD.status IN ('open', 'pending', 'reopened') AND NEW.started_at IS NULL THEN
    NEW.started_at := now();
  END IF;
  IF NEW.status = 'closed' AND OLD.status <> 'closed' THEN
    NEW.closed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ticket_status_timestamps_trigger ON admin_support_tickets;
CREATE TRIGGER ticket_status_timestamps_trigger
  BEFORE UPDATE OF status ON admin_support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.trg_ticket_status_timestamps();

-- Message-driven transitions: staff reply -> waiting_customer; customer
-- reply -> back to in_progress (or reopened + re-notify same staff, if the
-- ticket had already been resolved/closed).
CREATE OR REPLACE FUNCTION public.trg_ticket_message_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket admin_support_tickets%ROWTYPE;
BEGIN
  IF NEW.is_internal THEN
    RETURN NEW; -- internal notes never move the customer-facing state
  END IF;

  SELECT * INTO v_ticket FROM admin_support_tickets WHERE id = NEW.ticket_id;
  IF v_ticket.id IS NULL THEN RETURN NEW; END IF;

  IF NEW.author_type IN ('staff', 'admin') THEN
    UPDATE admin_support_tickets
      SET status = 'waiting_customer',
          last_reply_at = now(),
          last_admin_reply_at = now(),
          first_admin_reply_at = COALESCE(first_admin_reply_at, now())
      WHERE id = v_ticket.id AND status NOT IN ('resolved', 'closed');

  ELSIF NEW.author_type = 'customer' THEN
    IF v_ticket.status IN ('resolved', 'closed') THEN
      UPDATE admin_support_tickets
        SET status = 'reopened', reopened_at = now(), last_reply_at = now()
        WHERE id = v_ticket.id;

      IF v_ticket.assigned_to IS NOT NULL THEN
        INSERT INTO notifications (audience, recipient_team_member_id, type, title, body, metadata)
        VALUES ('staff', v_ticket.assigned_to, 'ticket_reopened', 'Ticket reopened: ' || v_ticket.subject,
          'The customer replied again after this was marked resolved.', jsonb_build_object('ticket_id', v_ticket.id));
      END IF;

      INSERT INTO admin_audit_logs (action, target_type, target_id, details)
      VALUES ('ticket.reopened', 'ticket', v_ticket.id::text, jsonb_build_object('reason', 'customer replied after resolve/close'));
    ELSE
      UPDATE admin_support_tickets
        SET status = CASE WHEN status = 'waiting_customer' THEN 'in_progress' ELSE status END,
            last_reply_at = now()
        WHERE id = v_ticket.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ticket_message_transition_trigger ON support_ticket_messages;
CREATE TRIGGER ticket_message_transition_trigger
  AFTER INSERT ON support_ticket_messages
  FOR EACH ROW EXECUTE FUNCTION public.trg_ticket_message_transition();

-- Auto-close: resolved tickets close themselves after 24h of no further
-- customer reply (design doc: "Resolved ke X ghante baad auto"). Reuses the
-- same sla-monitor cron already running every 15 min.
CREATE OR REPLACE FUNCTION public.run_auto_close()
RETURNS TABLE(closed integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_closed int;
BEGIN
  WITH updated AS (
    UPDATE admin_support_tickets
    SET status = 'closed', closed_at = now()
    WHERE status = 'resolved' AND resolved_at IS NOT NULL AND resolved_at < now() - interval '24 hours'
    RETURNING id
  )
  SELECT count(*) INTO v_closed FROM updated;
  RETURN QUERY SELECT v_closed;
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_auto_close() TO authenticated, service_role;
