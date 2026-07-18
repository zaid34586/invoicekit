create or replace function public.get_my_workspace_context()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.workspace_members%rowtype;
  v_workspace public.workspaces%rowtype;
  v_profile public.profiles%rowtype;
  v_invited boolean := false;
begin
  if not exists(select 1 from auth.users where id = auth.uid()) then
    return jsonb_build_object('owner_user_id', null, 'workspace_name', null, 'role', null, 'status', 'removed', 'owner_profile', null);
  end if;

  select * into v_member from public.workspace_members
  where coalesce(user_id, auth_user_id) = auth.uid()
  order by created_at desc limit 1;

  if v_member.id is not null then
    select * into v_workspace from public.workspaces where id = v_member.workspace_id;
    select * into v_profile from public.profiles where user_id = v_workspace.owner_user_id limit 1;
    return jsonb_build_object(
      'owner_user_id', v_workspace.owner_user_id,
      'workspace_name', v_workspace.name,
      'role', v_member.role,
      'status', v_member.status,
      'owner_profile', to_jsonb(v_profile)
    );
  end if;

  select coalesce((raw_user_meta_data->>'workspace_invitation_id') is not null, false)
  into v_invited from auth.users where id = auth.uid();
  if v_invited then
    return jsonb_build_object('owner_user_id', null, 'workspace_name', null, 'role', null, 'status', 'removed', 'owner_profile', null);
  end if;

  select * into v_workspace from public.workspaces where owner_user_id = auth.uid() limit 1;
  select * into v_profile from public.profiles where user_id = auth.uid() limit 1;
  return jsonb_build_object(
    'owner_user_id', auth.uid(),
    'workspace_name', coalesce(v_workspace.name, v_profile.business_name, 'My Workspace'),
    'role', 'owner', 'status', 'active', 'owner_profile', to_jsonb(v_profile)
  );
end;
$$;

grant execute on function public.get_my_workspace_context() to authenticated;

create or replace function public.current_workspace_role()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from public.workspace_members where coalesce(user_id, auth_user_id) = auth.uid() and status = 'active' limit 1),
    case when exists(select 1 from public.workspaces where owner_user_id = auth.uid()) then 'owner' end
  );
$$;
grant execute on function public.current_workspace_role() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['clients','invoices'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "workspace members access %1$s" on public.%1$I', t);
      execute format('drop policy if exists "workspace members select %1$s" on public.%1$I', t);
      execute format('create policy "workspace members select %1$s" on public.%1$I for select to authenticated using (user_id = public.current_workspace_owner_id() and public.current_workspace_role() in (''manager'',''accountant'',''staff''))', t);
      execute format('drop policy if exists "workspace members insert %1$s" on public.%1$I', t);
      execute format('create policy "workspace members insert %1$s" on public.%1$I for insert to authenticated with check (user_id = public.current_workspace_owner_id() and public.current_workspace_role() in (''manager'',''accountant'',''staff''))', t);
      execute format('drop policy if exists "workspace members update %1$s" on public.%1$I', t);
      execute format('create policy "workspace members update %1$s" on public.%1$I for update to authenticated using (user_id = public.current_workspace_owner_id() and public.current_workspace_role() in (''manager'',''accountant'',''staff'')) with check (user_id = public.current_workspace_owner_id())', t);
      execute format('drop policy if exists "workspace members delete %1$s" on public.%1$I', t);
      execute format('create policy "workspace members delete %1$s" on public.%1$I for delete to authenticated using (user_id = public.current_workspace_owner_id() and public.current_workspace_role() in (''manager'',''accountant''))', t);
    end if;
  end loop;
end $$;
