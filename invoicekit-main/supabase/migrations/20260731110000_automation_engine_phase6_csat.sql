-- Automation Engine Phase 6: CSAT (post-resolution feedback).
-- Design doc Section 8: "kya ye help useful thi? thumbs up/down" -- tracked
-- so rules/bot quality can be tuned later using real data.

ALTER TABLE admin_support_tickets ADD COLUMN IF NOT EXISTS csat_rating text CHECK (csat_rating IN ('up','down'));
ALTER TABLE admin_support_tickets ADD COLUMN IF NOT EXISTS csat_submitted_at timestamptz;

-- Customers don't have general UPDATE rights on admin_support_tickets (it's
-- staff-managed) -- this RPC is the one narrow, safe door: it only lets the
-- ticket's own owner set csat_rating on their own already-resolved/closed
-- ticket, once.
CREATE OR REPLACE FUNCTION public.submit_ticket_csat(p_ticket_id uuid, p_rating text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_rating NOT IN ('up', 'down') THEN
    RAISE EXCEPTION 'invalid rating: %', p_rating;
  END IF;

  UPDATE admin_support_tickets
  SET csat_rating = p_rating, csat_submitted_at = now()
  WHERE id = p_ticket_id
    AND user_id = auth.uid()
    AND status IN ('resolved', 'closed')
    AND csat_rating IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found, not yours, not resolved yet, or already rated';
  END IF;

  INSERT INTO admin_audit_logs (action, target_type, target_id, details)
  VALUES ('ticket.csat_submitted', 'ticket', p_ticket_id::text, jsonb_build_object('rating', p_rating));
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_ticket_csat(uuid, text) TO authenticated;
