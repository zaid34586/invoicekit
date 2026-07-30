-- Automation Engine Phase 4 (part 1): Live Chat foundation + staff presence.
--
-- Design choice: live chat is NOT a separate parallel system. A chat session
-- is just an admin_support_tickets row with origin='chat' (that value was
-- already reserved in the origin CHECK constraint back in Phase 1) and its
-- messages are ordinary support_ticket_messages rows. This means live chat
-- gets, for free, everything already built: keyword-based auto-assignment,
-- staff notifications, SLA breach escalation, and all existing RLS.
-- The only genuinely new pieces are (a) a bot author type + auto-welcome
-- message, and (b) staff online/away presence.

-- 1. Let the automation bot post messages (distinct from 'staff' replies) --
ALTER TABLE support_ticket_messages DROP CONSTRAINT IF EXISTS support_ticket_messages_author_type_check;
ALTER TABLE support_ticket_messages ADD CONSTRAINT support_ticket_messages_author_type_check
  CHECK (author_type IN ('customer','staff','admin','bot'));

-- 2. Staff presence -----------------------------------------------------------
ALTER TABLE admin_team_members ADD COLUMN IF NOT EXISTS presence_status text NOT NULL DEFAULT 'offline'
  CHECK (presence_status IN ('online','away','offline'));
ALTER TABLE admin_team_members ADD COLUMN IF NOT EXISTS presence_updated_at timestamptz;

-- Staff update their OWN presence only, through a locked-down RPC (never a
-- blanket UPDATE policy on admin_team_members -- that would let a staff
-- member touch their own role/status too).
CREATE OR REPLACE FUNCTION public.update_my_presence(p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_status NOT IN ('online','away','offline') THEN
    RAISE EXCEPTION 'invalid presence status: %', p_status;
  END IF;
  UPDATE admin_team_members
  SET presence_status = p_status, presence_updated_at = now()
  WHERE auth_user_id = auth.uid() AND status = 'active';
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_my_presence(text) TO authenticated;

-- Auto-away: anyone who hasn't touched their presence in 10+ min shown as
-- offline/away by this read-side helper (avoids relying on a cron for a
-- cosmetic status -- called from the client every time the team list loads).
CREATE OR REPLACE FUNCTION public.effective_presence(p_status text, p_updated_at timestamptz)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN p_updated_at IS NULL THEN 'offline'
    WHEN now() - p_updated_at > interval '10 minutes' THEN 'offline'
    ELSE p_status
  END;
$$;

-- 3. Bot welcome message on a new chat session -------------------------------
CREATE OR REPLACE FUNCTION public.post_chat_welcome_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_online_count integer;
BEGIN
  IF NEW.origin <> 'chat' THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_online_count
  FROM admin_team_members m
  WHERE m.status = 'active'
    AND m.role IN ('support','finance','full_access')
    AND m.presence_status = 'online'
    AND m.presence_updated_at > now() - interval '10 minutes';

  INSERT INTO support_ticket_messages (ticket_id, author_type, message, is_internal)
  VALUES (
    NEW.id,
    'bot',
    CASE
      WHEN v_online_count > 0 THEN 'Thanks for reaching out! A team member is online now and will be with you shortly.'
      ELSE 'Thanks for reaching out! Our team is currently offline but will reply as soon as they''re back -- this has already been logged as a ticket so nothing gets lost.'
    END,
    false
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_post_chat_welcome_message ON admin_support_tickets;
CREATE TRIGGER trg_post_chat_welcome_message
AFTER INSERT ON admin_support_tickets
FOR EACH ROW EXECUTE FUNCTION public.post_chat_welcome_message();
