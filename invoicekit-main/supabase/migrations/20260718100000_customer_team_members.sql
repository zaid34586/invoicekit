-- Rivox customer workspace team members (Free/Pro/Business)
create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists workspace_owner_id uuid,
  add column if not exists workspace_role text,
  add column if not exists workspace_member_status text;

update public.profiles
set workspace_owner_id = coalesce(workspace_owner_id, user_id, id),
    workspace_role = coalesce(workspace_role, 'owner'),
    workspace_member_status = coalesce(workspace_member_status, 'active')
where workspace_owner_id is null or workspace_role is null or workspace_member_status is null;

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_owner_id uuid not null,
  auth_user_id uuid,
  email text not null,
  name text,
  role text not null check (role in ('manager','accountant','staff')),
  status text not null default 'pending' check (status in ('pending','active','disabled')),
  invited_by uuid not null,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  last_invited_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_owner_id, email)
);

create index if not exists workspace_members_owner_idx on public.workspace_members(workspace_owner_id);
create index if not exists workspace_members_auth_idx on public.workspace_members(auth_user_id);

alter table public.workspace_members enable row level security;

drop policy if exists "workspace owners manage members" on public.workspace_members;
create policy "workspace owners manage members"
on public.workspace_members for all
to authenticated
using (workspace_owner_id = auth.uid())
with check (workspace_owner_id = auth.uid() and invited_by = auth.uid());

drop policy if exists "members read own membership" on public.workspace_members;
create policy "members read own membership"
on public.workspace_members for select
to authenticated
using (auth_user_id = auth.uid());

create or replace function public.current_workspace_owner_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.workspace_owner_id from public.profiles p where p.user_id = auth.uid() or p.id = auth.uid() limit 1),
    auth.uid()
  );
$$;

grant execute on function public.current_workspace_owner_id() to authenticated;

-- Add workspace-member access without removing existing owner policies.
do $$
declare t text;
begin
  foreach t in array array['clients','invoices'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "workspace members access %1$s" on public.%1$I', t);
      execute format($p$
        create policy "workspace members access %1$s"
        on public.%1$I for all to authenticated
        using (user_id = public.current_workspace_owner_id())
        with check (user_id = public.current_workspace_owner_id())
      $p$, t);
    end if;
  end loop;
end $$;
