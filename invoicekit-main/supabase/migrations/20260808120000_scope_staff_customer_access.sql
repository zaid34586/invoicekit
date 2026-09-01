-- SECURITY FIX: staff_read_customer_profiles / staff_read_customer_invoices /
-- staff_read_customer_clients (added in 20260802110000) granted read access
-- to EVERY customer's profile, invoices, and clients to ANY active staff
-- member with role in ('support','finance','viewer','full_access','standard',
-- 'limited') -- the policy never checked WHICH customer that staff member
-- was actually assigned to. Any support/finance/viewer/standard staff
-- account could dump every customer's business data platform-wide.
--
-- Fix: scope access to customers the staff member is actually assigned to,
-- via an admin_support_tickets row or an admin_tasks row linked to that
-- customer (same join pattern already used correctly by
-- staff_read_linked_task_* in 20260709190000). 'full_access' keeps
-- unrestricted read access -- that's what the role name is for.

-- staff_read_linked_task_* (20260709190000) checked the exact same
-- admin_tasks join that's now folded into staff_read_customer_* above --
-- keeping both around is redundant and makes future audits harder to trust.
DROP POLICY IF EXISTS "staff_read_linked_task_profiles" ON profiles;
DROP POLICY IF EXISTS "staff_read_linked_task_invoices" ON invoices;
DROP POLICY IF EXISTS "staff_read_linked_task_clients" ON clients;

DROP POLICY IF EXISTS "staff_read_customer_profiles" ON profiles;
CREATE POLICY "staff_read_customer_profiles" ON profiles
FOR SELECT TO authenticated
USING (
  lower(coalesce(email, '')) NOT IN (SELECT lower(email) FROM admin_team_members WHERE email IS NOT NULL)
  AND EXISTS (
    SELECT 1 FROM admin_team_members tm
    WHERE tm.status = 'active'
      AND (tm.auth_user_id = auth.uid() OR lower(tm.email) = lower(auth.jwt() ->> 'email'))
      AND (
        tm.role = 'full_access'
        OR EXISTS (SELECT 1 FROM admin_support_tickets st WHERE st.assigned_to = tm.id AND st.user_id = profiles.id)
        OR EXISTS (SELECT 1 FROM admin_tasks t WHERE t.assigned_to = tm.id AND t.customer_id = profiles.id)
      )
  )
);

DROP POLICY IF EXISTS "staff_read_customer_invoices" ON invoices;
CREATE POLICY "staff_read_customer_invoices" ON invoices
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admin_team_members tm
    WHERE tm.status = 'active'
      AND (tm.auth_user_id = auth.uid() OR lower(tm.email) = lower(auth.jwt() ->> 'email'))
      AND (
        tm.role = 'full_access'
        OR EXISTS (SELECT 1 FROM admin_support_tickets st WHERE st.assigned_to = tm.id AND st.user_id = invoices.user_id)
        OR EXISTS (SELECT 1 FROM admin_tasks t WHERE t.assigned_to = tm.id AND t.customer_id = invoices.user_id)
      )
  )
);

DROP POLICY IF EXISTS "staff_read_customer_clients" ON clients;
CREATE POLICY "staff_read_customer_clients" ON clients
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admin_team_members tm
    WHERE tm.status = 'active'
      AND (tm.auth_user_id = auth.uid() OR lower(tm.email) = lower(auth.jwt() ->> 'email'))
      AND (
        tm.role = 'full_access'
        OR EXISTS (SELECT 1 FROM admin_support_tickets st WHERE st.assigned_to = tm.id AND st.user_id = clients.user_id)
        OR EXISTS (SELECT 1 FROM admin_tasks t WHERE t.assigned_to = tm.id AND t.customer_id = clients.user_id)
      )
  )
);
