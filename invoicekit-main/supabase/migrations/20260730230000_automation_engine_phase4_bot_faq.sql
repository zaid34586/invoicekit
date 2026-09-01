-- Automation Engine Phase 4 (part 2): Bot self-serve layer.
--
-- Phase 4 part 1 gave the bot a welcome message only -- every chat still had
-- to reach a human. This adds the actual "assist" step from the design doc
-- (Section 3): a small keyword -> answer table the bot checks BEFORE a human
-- has replied, capped at 2 attempts, with escalation-keyword detection
-- (angry/urgent customer -> priority urgent + explicit handoff message)
-- so it can never leave someone stuck talking to a bot forever.

-- 1. FAQ knowledge base (data, not code -- same principle as assignment_rules)
CREATE TABLE IF NOT EXISTS chat_faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL,
  keywords text NOT NULL,   -- comma-separated match terms
  answer text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE chat_faqs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_manage_chat_faqs" ON chat_faqs;
CREATE POLICY "admin_manage_chat_faqs" ON chat_faqs FOR ALL
  TO authenticated USING (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com')
  WITH CHECK (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');
-- No customer-facing SELECT policy on purpose -- the bot looks these up
-- server-side (SECURITY DEFINER trigger below), customers never query the
-- table directly.

INSERT INTO chat_faqs (question, keywords, answer)
SELECT * FROM (VALUES
  ('How do I reset my password?', 'password,reset,forgot,login,cant sign in,can''t sign in',
   'You can reset your password from the Login page -> "Forgot password?" -> enter your email and follow the link we send you.'),
  ('How do I download an invoice PDF?', 'download,pdf,invoice pdf,export invoice',
   'Open the invoice from Invoices, then use the Download/Export button at the top to get a PDF copy.'),
  ('How do I upgrade my plan?', 'upgrade,plan,pro,pricing,subscription change',
   'Go to Billing -> Plans & Pricing and pick the plan you want -- the change applies immediately and any difference is prorated.'),
  ('What is your refund policy?', 'refund policy,refund,money back,cancel subscription',
   'You can request a refund from Billing -> Support, or reply here with your order details and our finance team will take a look.'),
  ('How do I add a client?', 'add client,new client,create client',
   'Go to Clients -> New Client and fill in their details -- you can then select them when creating an invoice.')
) AS seed(question, keywords, answer)
WHERE NOT EXISTS (SELECT 1 FROM chat_faqs);

-- 2. Track bot attempts per ticket so it can never loop forever ------------
ALTER TABLE admin_support_tickets ADD COLUMN IF NOT EXISTS bot_attempts integer NOT NULL DEFAULT 0;

-- 3. Bot self-serve reply on customer chat messages -------------------------
CREATE OR REPLACE FUNCTION public.trg_bot_chat_assist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket admin_support_tickets%ROWTYPE;
  v_haystack text := lower(coalesce(NEW.message, ''));
  v_faq chat_faqs%ROWTYPE;
  v_escalate boolean := false;
BEGIN
  IF NEW.author_type <> 'customer' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_ticket FROM admin_support_tickets WHERE id = NEW.ticket_id;
  IF v_ticket.id IS NULL OR v_ticket.origin <> 'chat' OR v_ticket.status IN ('resolved','closed') THEN
    RETURN NEW;
  END IF;
  IF v_ticket.first_admin_reply_at IS NOT NULL THEN
    RETURN NEW; -- a human already took over, bot stays quiet from here on
  END IF;

  -- Escalation keywords (angry/urgent/explicitly wants a human) --------------
  IF v_haystack ~ '(cancel|fraud|legal|refund now|refund abhi|human|agent|talk to (a )?person)' THEN
    v_escalate := true;
  END IF;

  IF NOT v_escalate AND v_ticket.bot_attempts >= 2 THEN
    v_escalate := true; -- bot tried twice already, hand off per design doc
  END IF;

  IF v_escalate THEN
    UPDATE admin_support_tickets SET priority = 'urgent' WHERE id = v_ticket.id AND priority <> 'urgent';
    INSERT INTO support_ticket_messages (ticket_id, author_type, message, is_internal)
    VALUES (NEW.ticket_id, 'bot', 'Got it -- connecting you with a human team member now. They''ll take it from here.', false);
    INSERT INTO admin_audit_logs (action, target_type, target_id, details)
    VALUES ('chat.bot_escalated', 'ticket', v_ticket.id::text, jsonb_build_object('reason', 'keyword_or_attempt_limit', 'bot_attempts', v_ticket.bot_attempts));
    RETURN NEW;
  END IF;

  -- Try to answer from the FAQ table -----------------------------------------
  FOR v_faq IN SELECT * FROM chat_faqs WHERE is_active ORDER BY created_at ASC LOOP
    IF EXISTS (
      SELECT 1 FROM unnest(string_to_array(v_faq.keywords, ',')) kw
      WHERE v_haystack LIKE '%' || trim(kw) || '%'
    ) THEN
      INSERT INTO support_ticket_messages (ticket_id, author_type, message, is_internal)
      VALUES (NEW.ticket_id, 'bot', v_faq.answer || E'\n\nDid this solve it? If not, just reply and our team will jump in.', false);
      UPDATE admin_support_tickets SET bot_attempts = bot_attempts + 1 WHERE id = v_ticket.id;
      INSERT INTO admin_audit_logs (action, target_type, target_id, details)
      VALUES ('chat.bot_replied', 'ticket', v_ticket.id::text, jsonb_build_object('faq_id', v_faq.id));
      RETURN NEW;
    END IF;
  END LOOP;

  -- No FAQ matched -- stay quiet (ticket is already auto-assigned to a human
  -- from creation; no need to spam a "I don't understand" message every turn).
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bot_chat_assist_trigger ON support_ticket_messages;
CREATE TRIGGER trg_bot_chat_assist_trigger
  AFTER INSERT ON support_ticket_messages
  FOR EACH ROW EXECUTE FUNCTION public.trg_bot_chat_assist();
