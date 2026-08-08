-- SECURITY FIX: support_staff_read_tickets (on admin_support_tickets) and
-- support_staff_read_messages (on support_ticket_messages) granted ANY
-- active staff member with role in ('support','full_access','finance')
-- read access to EVERY customer's support ticket and every ticket
-- conversation, regardless of who it was assigned to. A narrower
-- staff_read_assigned_tickets policy already exists (assigned_to = this
-- staff member, or unassigned) -- but since RLS policies OR together, the
-- broad one made that scoping meaningless for anyone with those roles.
--
-- 'full_access' keeps unrestricted read (that's what the role name is
-- for); support/finance staff now fall through to the existing
-- assignment-scoped policies instead.

DROP POLICY IF EXISTS "support_staff_read_tickets" ON admin_support_tickets;
CREATE POLICY "support_staff_read_tickets" ON admin_support_tickets
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM admin_team_members m
  WHERE m.auth_user_id = auth.uid()
    AND m.status = 'active'
    AND m.role = 'full_access'
));

DROP POLICY IF EXISTS "support_staff_read_messages" ON support_ticket_messages;
CREATE POLICY "support_staff_read_messages" ON support_ticket_messages
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM admin_team_members m
  WHERE m.auth_user_id = auth.uid()
    AND m.status = 'active'
    AND m.role = 'full_access'
));
