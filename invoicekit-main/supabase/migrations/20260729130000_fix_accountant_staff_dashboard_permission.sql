-- Bug-008: accountant and staff team members hit "Permission required" right
-- after logging in / accepting their invite, even though their actual
-- pages (clients, invoices, reports) were correctly permitted.
--
-- Root cause: the app lands every signed-in user on /dashboard first, and
-- that route requires the 'dashboard.view' permission. default_workspace_
-- permissions() gave 'dashboard.view' to 'manager' but NOT to 'accountant'
-- or 'staff', so both roles were blocked on the very first page they saw.
-- Members with no custom permissions saved (the common case) resolve their
-- permission set live from this function, so fixing it here fixes existing
-- accountant/staff members immediately -- no data backfill needed.
create or replace function public.default_workspace_permissions(p_role text)
returns jsonb language sql immutable as $$
  select case p_role
    when 'owner' then '["*"]'::jsonb
    when 'manager' then '["dashboard.view","clients.view","clients.manage","invoices.view","invoices.create","invoices.edit","invoices.delete","reports.view","support.view"]'::jsonb
    when 'accountant' then '["dashboard.view","clients.view","invoices.view","reports.view","support.view"]'::jsonb
    when 'staff' then '["dashboard.view","clients.view","clients.manage","invoices.view","invoices.create","invoices.edit","support.view"]'::jsonb
    else '[]'::jsonb end;
$$;

-- Also patch any members whose permissions were already customized (via the
-- permission editor) while the old defaults were in effect, so they aren't
-- still locked out of their own dashboard.
update public.workspace_members
set permissions = permissions || '["dashboard.view"]'::jsonb,
    updated_at = now()
where role in ('accountant', 'staff')
  and permissions is not null
  and not (permissions ? '*')
  and not (permissions ? 'dashboard.view');

