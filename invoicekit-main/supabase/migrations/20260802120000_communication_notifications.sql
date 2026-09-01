-- Internal team chat (Communication section) notifications.
-- The chat itself already had realtime (communication_messages is in the
-- supabase_realtime publication and CommunicationCenter subscribes to it),
-- but only helped if you already had that exact conversation open. This
-- adds a real notification (+ sound, reusing the exact same `notifications`
-- pipe every other part of the app already uses) for every OTHER member of
-- the channel whenever someone sends a message.

CREATE OR REPLACE FUNCTION public.trg_notify_communication_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_channel_name text;
  v_recipient RECORD;
BEGIN
  SELECT name INTO v_channel_name FROM communication_channels WHERE id = NEW.channel_id;

  FOR v_recipient IN
    SELECT tm.id AS team_member_id
    FROM communication_channel_members cm
    JOIN admin_team_members tm ON tm.auth_user_id = cm.user_id
    WHERE cm.channel_id = NEW.channel_id
      AND cm.user_id <> NEW.sender_user_id
      AND tm.status = 'active'
  LOOP
    INSERT INTO notifications (audience, recipient_team_member_id, type, title, body, metadata)
    VALUES (
      'staff', v_recipient.team_member_id, 'team_message',
      NEW.sender_name || ' (' || coalesce(v_channel_name, 'chat') || ')',
      left(NEW.body, 140),
      jsonb_build_object('channel_id', NEW.channel_id, 'message_id', NEW.id)
    );
  END LOOP;

  -- Also notify the owner if they're a channel member but have no
  -- admin_team_members row (owner isn't staff) -- handled separately since
  -- the join above only covers staff.
  IF EXISTS (
    SELECT 1 FROM communication_channel_members cm
    WHERE cm.channel_id = NEW.channel_id AND cm.user_id <> NEW.sender_user_id
      AND cm.user_id = public.rivox_owner_user_id()
  ) THEN
    INSERT INTO notifications (audience, type, title, body, metadata)
    VALUES ('admin', 'team_message', NEW.sender_name || ' (' || coalesce(v_channel_name, 'chat') || ')', left(NEW.body, 140), jsonb_build_object('channel_id', NEW.channel_id, 'message_id', NEW.id));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_communication_message_trigger ON communication_messages;
CREATE TRIGGER notify_communication_message_trigger
  AFTER INSERT ON communication_messages
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_communication_message();
