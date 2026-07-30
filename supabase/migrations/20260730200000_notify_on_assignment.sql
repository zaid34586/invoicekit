-- Fix: ticket/task assignment (manual OR the Phase 1 automation engine) never
-- wrote a row into public.notifications. The realtime + sound wiring added in
-- 20260730100000 was correct, but had nothing to fire on -- so an assignee
-- (e.g. a Finance-role staff member auto-assigned to a billing ticket) never
-- got notified. This adds an AFTER trigger on both tables so ANY assignment
-- (auto or manual) and any reassignment instantly creates a notification.

-- 1. Support tickets ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_ticket_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to) THEN
    INSERT INTO notifications (audience, recipient_team_member_id, type, title, body, metadata)
    VALUES (
      'staff',
      NEW.assigned_to,
      CASE WHEN NEW.origin = 'auto' THEN 'ticket_auto_assigned' ELSE 'ticket_assigned' END,
      CASE WHEN NEW.origin = 'auto' THEN 'New ticket auto-assigned to you' ELSE 'Ticket assigned to you' END,
      COALESCE(NEW.ticket_number, NEW.id::text) || ' · ' || NEW.subject,
      jsonb_build_object('ticket_id', NEW.id, 'priority', NEW.priority)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_ticket_assignment ON admin_support_tickets;
CREATE TRIGGER trg_notify_ticket_assignment
AFTER INSERT OR UPDATE OF assigned_to ON admin_support_tickets
FOR EACH ROW EXECUTE FUNCTION public.notify_ticket_assignment();

-- 2. Tasks ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_task_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to) THEN
    INSERT INTO notifications (audience, recipient_team_member_id, type, title, body, metadata)
    VALUES (
      'staff',
      NEW.assigned_to,
      CASE WHEN NEW.origin = 'auto' THEN 'task_auto_assigned' ELSE 'task_assigned' END,
      CASE
        WHEN TG_OP = 'UPDATE' THEN 'Task reassigned to you'
        WHEN NEW.origin = 'auto' THEN 'New task auto-assigned to you'
        ELSE 'Task assigned to you'
      END,
      NEW.title,
      jsonb_build_object('task_id', NEW.id, 'priority', NEW.priority)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_task_assignment ON admin_tasks;
CREATE TRIGGER trg_notify_task_assignment
AFTER INSERT OR UPDATE OF assigned_to ON admin_tasks
FOR EACH ROW EXECUTE FUNCTION public.notify_task_assignment();
