create extension if not exists pgcrypto;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null default 'My Workspace',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  name text,
  role text not null check (role in ('owner','manager','accountant','staff')),
  status text not null default 'active' check (status in ('active','disabled')),
  invited_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id),
  unique (workspace_id, email)
);

create table if not exists public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  name text,
  role text not null check (role in ('manager','accountant','staff')),
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  invited_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists workspace_pending_invite_unique
on public.workspace_invitations(workspace_id, lower(email))
where status = 'pending';

insert into public.workspaces(owner_user_id, name)
select p.user_id, coalesce(nullif(p.business_name,''), 'My Workspace')
from public.profiles p
where p.user_id is not null
on conflict (owner_user_id) do update set name = excluded.name;

insert into public.workspace_members(workspace_id,user_id,email,name,role,status,invited_by)
select w.id, w.owner_user_id, coalesce(u.email,''), coalesce(p.business_name,'Owner'), 'owner','active',w.owner_user_id
from public.workspaces w
join auth.users u on u.id=w.owner_user_id
left join public.profiles p on p.user_id=w.owner_user_id
on conflict (workspace_id,user_id) do nothing;

create or replace function public.ensure_workspace_for_owner(p_owner uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_workspace uuid; v_name text;
begin
  if auth.uid() is distinct from p_owner and auth.role() <> 'service_role' then raise exception 'not allowed'; end if;
  select coalesce(nullif(business_name,''),'My Workspace') into v_name from public.profiles where user_id=p_owner limit 1;
  insert into public.workspaces(owner_user_id,name) values(p_owner,coalesce(v_name,'My Workspace'))
  on conflict(owner_user_id) do update set updated_at=now() returning id into v_workspace;
  insert into public.workspace_members(workspace_id,user_id,email,name,role,status,invited_by)
  select v_workspace,p_owner,coalesce(email,''),coalesce(v_name,'Owner'),'owner','active',p_owner from auth.users where id=p_owner
  on conflict(workspace_id,user_id) do nothing;
  return v_workspace;
end $$;

create or replace function public.claim_workspace_invitation()
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_email text; v_inv public.workspace_invitations%rowtype;
begin
  select lower(email) into v_email from auth.users where id=auth.uid();
  if v_email is null then return jsonb_build_object('claimed',false); end if;
  update public.workspace_invitations set status='expired',updated_at=now() where status='pending' and expires_at<=now();
  select * into v_inv from public.workspace_invitations
  where lower(email)=v_email and status='pending' and expires_at>now()
  order by created_at desc limit 1;
  if v_inv.id is null then return jsonb_build_object('claimed',false); end if;
  insert into public.workspace_members(workspace_id,user_id,email,name,role,status,invited_by)
  values(v_inv.workspace_id,auth.uid(),v_email,v_inv.name,v_inv.role,'active',v_inv.invited_by)
  on conflict(workspace_id,user_id) do update set role=excluded.role,status='active',email=excluded.email,name=excluded.name,updated_at=now();
  update public.workspace_invitations set status='accepted',updated_at=now() where id=v_inv.id;
  return jsonb_build_object('claimed',true,'workspace_id',v_inv.workspace_id,'role',v_inv.role);
end $$;

grant execute on function public.claim_workspace_invitation() to authenticated;
grant execute on function public.ensure_workspace_for_owner(uuid) to authenticated, service_role;

create or replace function public.is_workspace_member(p_workspace uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.workspace_members where workspace_id=p_workspace and user_id=auth.uid() and status='active')
$$;
create or replace function public.is_workspace_owner(p_workspace uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.workspaces where id=p_workspace and owner_user_id=auth.uid())
$$;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.is_workspace_owner(uuid) to authenticated;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invitations enable row level security;

create policy "workspace members can view workspace" on public.workspaces for select to authenticated using (owner_user_id=auth.uid() or public.is_workspace_member(id));
create policy "members can view workspace members" on public.workspace_members for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "owners can view invitations" on public.workspace_invitations for select to authenticated using (public.is_workspace_owner(workspace_id));
