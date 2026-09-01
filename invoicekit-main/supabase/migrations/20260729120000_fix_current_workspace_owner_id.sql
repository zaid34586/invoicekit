-- Bug-006: invited team members could not create/edit invoices or clients
-- ("new row violates row-level security policy for table invoices") and
-- their dashboard/clients/invoices always showed empty data, even though
-- the owner's workspace clearly had data.
--
-- Root cause: public.current_workspace_owner_id() -- used by every
-- clients/invoices RLS policy (and several others, e.g. support tickets) --
-- still resolved the owner from the OLD legacy public.profiles.workspace_owner_id
-- column. That column was only ever backfilled once, for the old team
-- system. Members who join through the current invite flow
-- (workspaces / workspace_members + claim_workspace_invitation()) never get
-- that column populated on their own profile row, so the function fell
-- through to its `coalesce(..., auth.uid())` fallback and returned the
-- MEMBER's own id instead of the real workspace owner's id.
--
-- Every "user_id = current_workspace_owner_id()" RLS check therefore
-- compared the owner's data (user_id = owner) against the member's own id,
-- which never matched: reads silently returned zero rows (empty dashboard,
-- empty clients) and writes were rejected outright (RLS violation on
-- insert).
--
-- Fix: resolve the owner the same way get_my_workspace_context() and
-- has_workspace_permission() already do -- via the active workspace_members
-- row -- and only fall back to the legacy profiles column for any old data
-- that predates the workspaces/workspace_members system.
create or replace function public.current_workspace_owner_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  -- Workspace owners are their own owner.
  if exists (select 1 from public.workspaces where owner_user_id = auth.uid()) then
    return auth.uid();
  end if;

  -- Active workspace members (current invite system) resolve to the real owner.
  select w.owner_user_id into v_owner
  from public.workspace_members wm
  join public.workspaces w on w.id = wm.workspace_id
  where coalesce(wm.user_id, wm.auth_user_id) = auth.uid()
    and wm.status = 'active'
  order by wm.created_at desc
  limit 1;

  if v_owner is not null then
    return v_owner;
  end if;

  -- Legacy fallback: the old profiles.workspace_owner_id column, kept only
  -- for rows that predate the workspaces/workspace_members system.
  select p.workspace_owner_id into v_owner
  from public.profiles p
  where p.user_id = auth.uid() or p.id = auth.uid()
  limit 1;

  return coalesce(v_owner, auth.uid());
end;
$$;

grant execute on function public.current_workspace_owner_id() to authenticated;
