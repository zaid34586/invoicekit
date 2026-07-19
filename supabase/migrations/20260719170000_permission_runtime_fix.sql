-- Force the production database to expose the saved Business custom
-- permissions. This is a new migration because an already-applied migration
-- is not rerun when its file is later edited.
alter table public.workspace_members
  add column if not exists permissions jsonb,
  add column if not exists custom_role_name text;

create or replace function public.default_workspace_permissions(p_role text)
returns jsonb language sql immutable as $$
  select case p_role
    when 'owner' then '["*"]'::jsonb
    when 'manager' then '["dashboard.view","clients.view","clients.manage","invoices.view","invoices.create","invoices.edit","invoices.delete","reports.view","support.view"]'::jsonb
    when 'accountant' then '["clients.view","invoices.view","reports.view","support.view"]'::jsonb
    when 'staff' then '["clients.view","clients.manage","invoices.view","invoices.create","invoices.edit","support.view"]'::jsonb
    else '[]'::jsonb end;
$$;

create or replace function public.get_my_workspace_context()
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_member public.workspace_members%rowtype; v_workspace public.workspaces%rowtype; v_profile public.profiles%rowtype; v_invited boolean:=false;
begin
  if auth.uid() is null then return jsonb_build_object('owner_user_id',null,'workspace_name',null,'role',null,'status','removed','permissions','[]'::jsonb,'owner_profile',null); end if;
  select * into v_member from public.workspace_members
    where user_id=auth.uid() or auth_user_id=auth.uid()
    order by case when status='active' then 0 else 1 end, created_at desc limit 1;
  if v_member.id is not null then
    select * into v_workspace from public.workspaces where id=v_member.workspace_id;
    select * into v_profile from public.profiles where user_id=v_workspace.owner_user_id limit 1;
    return jsonb_build_object(
      'owner_user_id',v_workspace.owner_user_id,
      'workspace_name',v_workspace.name,
      'role',v_member.role,
      'custom_role_name',v_member.custom_role_name,
      'status',v_member.status,
      'permissions',case when v_member.permissions is null then public.default_workspace_permissions(v_member.role) else v_member.permissions end,
      'owner_profile',to_jsonb(v_profile)
    );
  end if;
  select coalesce((raw_user_meta_data->>'workspace_invitation_id') is not null,false) into v_invited from auth.users where id=auth.uid();
  if v_invited then return jsonb_build_object('owner_user_id',null,'workspace_name',null,'role',null,'status','removed','permissions','[]'::jsonb,'owner_profile',null); end if;
  select * into v_workspace from public.workspaces where owner_user_id=auth.uid() limit 1;
  select * into v_profile from public.profiles where user_id=auth.uid() limit 1;
  return jsonb_build_object('owner_user_id',auth.uid(),'workspace_name',coalesce(v_workspace.name,v_profile.business_name,'My Workspace'),'role','owner','status','active','permissions','["*"]'::jsonb,'owner_profile',to_jsonb(v_profile));
end; $$;
grant execute on function public.get_my_workspace_context() to authenticated;

-- A tiny dedicated RPC makes permission refresh independent from profile data.
create or replace function public.get_my_workspace_permissions()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_member public.workspace_members%rowtype;
begin
  if exists(select 1 from public.workspaces where owner_user_id=auth.uid()) then return '["*"]'::jsonb; end if;
  select * into v_member from public.workspace_members
    where (user_id=auth.uid() or auth_user_id=auth.uid()) and status='active'
    order by created_at desc limit 1;
  if v_member.id is null then return '[]'::jsonb; end if;
  return case when v_member.permissions is null then public.default_workspace_permissions(v_member.role) else v_member.permissions end;
end; $$;
grant execute on function public.get_my_workspace_permissions() to authenticated;
