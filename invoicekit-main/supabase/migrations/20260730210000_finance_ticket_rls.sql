-- Fix: the automation engine (assignment_rules, Phase 1) correctly routes
-- billing/refund tickets to Finance-role staff, and the app-level permission
-- was just fixed to let "finance" see the Tickets nav item -- but the actual
-- Postgres RLS policies on admin_support_tickets AND support_ticket_messages
-- never included 'finance' in their role checks (only support/limited/
-- full_access). Without this, a finance staff member would still get zero
-- rows / a blocked reply at the DB level even with the UI unlocked. Adding
-- 'finance' to every staff-facing ticket + message policy so a ticket the
-- engine assigned to them is actually readable, updatable, and repliable.

-- 1. Ticket read/update ---------------------------------------------------
DROP POLICY IF EXISTS "staff_read_assigned_tickets" ON admin_support_tickets;
CREATE POLICY "staff_read_assigned_tickets" ON admin_support_tickets
FOR SELECT TO authenticated
USING (
  assigned_to IS NULL
  OR assigned_to IN (
    SELECT id
    FROM admin_team_members
    WHERE status = 'active'
      AND role IN ('support', 'limited', 'full_access', 'finance')
      AND (auth_user_id = auth.uid() OR lower(email) = lower(auth.jwt() ->> 'email'))
  )
);

DROP POLICY IF EXISTS "staff_update_assigned_tickets" ON admin_support_tickets;
CREATE POLICY "staff_update_assigned_tickets" ON admin_support_tickets
FOR UPDATE TO authenticated
USING (
  assigned_to IN (
    SELECT id
    FROM admin_team_members
    WHERE status = 'active'
      AND role IN ('limited', 'support', 'full_access', 'finance')
      AND (auth_user_id = auth.uid() OR lower(email) = lower(auth.jwt() ->> 'email'))
  )
)
WITH CHECK (
  assigned_to IN (
    SELECT id
    FROM admin_team_members
    WHERE status = 'active'
      AND role IN ('limited', 'support', 'full_access', 'finance')
      AND (auth_user_id = auth.uid() OR lower(email) = lower(auth.jwt() ->> 'email'))
  )
);

DROP POLICY IF EXISTS "support_staff_read_tickets" ON admin_support_tickets;
CREATE POLICY "support_staff_read_tickets"
ON admin_support_tickets FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM admin_team_members m
  WHERE m.auth_user_id = auth.uid()
    AND m.status = 'active'
    AND m.role IN ('support','full_access','finance')
));

DROP POLICY IF EXISTS "support_staff_update_tickets" ON admin_support_tickets;
CREATE POLICY "support_staff_update_tickets"
ON admin_support_tickets FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM admin_team_members m
  WHERE m.auth_user_id = auth.uid()
    AND m.status = 'active'
    AND m.role IN ('support','full_access','finance')
))
WITH CHECK (EXISTS (
  SELECT 1 FROM admin_team_members m
  WHERE m.auth_user_id = auth.uid()
    AND m.status = 'active'
    AND m.role IN ('support','full_access','finance')
));

-- 2. Ticket messages (reading the conversation + sending a reply) --------
DROP POLICY IF EXISTS "support_staff_read_messages" ON support_ticket_messages;
CREATE POLICY "support_staff_read_messages"
ON support_ticket_messages FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM admin_team_members m
  WHERE m.auth_user_id = auth.uid()
    AND m.status = 'active'
    AND m.role IN ('support','full_access','finance')
));

DROP POLICY IF EXISTS "support_staff_add_messages" ON support_ticket_messages;
CREATE POLICY "support_staff_add_messages"
ON support_ticket_messages FOR INSERT TO authenticated
WITH CHECK (
  author_user_id = auth.uid()
  AND author_type = 'staff'
  AND EXISTS (
    SELECT 1 FROM admin_team_members m
    WHERE m.auth_user_id = auth.uid()
      AND m.status = 'active'
      AND m.role IN ('support','full_access','finance')
  )
);
