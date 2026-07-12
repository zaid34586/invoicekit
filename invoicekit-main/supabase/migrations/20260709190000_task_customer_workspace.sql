-- Staff task customer workspace support. Safe to run multiple times.

ALTER TABLE public.admin_tasks
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_admin_tasks_customer_id ON public.admin_tasks(customer_id);

-- Allow active staff to read customer/profile/invoice/client records linked to their assigned tasks.
DROP POLICY IF EXISTS "staff_read_linked_task_profiles" ON public.profiles;
DROP POLICY IF EXISTS "staff_read_linked_task_invoices" ON public.invoices;
DROP POLICY IF EXISTS "staff_read_linked_task_clients" ON public.clients;

CREATE POLICY "staff_read_linked_task_profiles" ON public.profiles
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.admin_team_members tm
    JOIN public.admin_tasks t ON t.assigned_to = tm.id
    WHERE tm.status = 'active'
      AND (tm.auth_user_id = auth.uid() OR lower(tm.email) = lower(auth.jwt() ->> 'email'))
      AND t.customer_id = profiles.id
  )
);

CREATE POLICY "staff_read_linked_task_invoices" ON public.invoices
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.admin_team_members tm
    JOIN public.admin_tasks t ON t.assigned_to = tm.id
    WHERE tm.status = 'active'
      AND (tm.auth_user_id = auth.uid() OR lower(tm.email) = lower(auth.jwt() ->> 'email'))
      AND t.customer_id = invoices.user_id
  )
);

CREATE POLICY "staff_read_linked_task_clients" ON public.clients
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.admin_team_members tm
    JOIN public.admin_tasks t ON t.assigned_to = tm.id
    WHERE tm.status = 'active'
      AND (tm.auth_user_id = auth.uid() OR lower(tm.email) = lower(auth.jwt() ->> 'email'))
      AND t.customer_id = clients.user_id
  )
);
