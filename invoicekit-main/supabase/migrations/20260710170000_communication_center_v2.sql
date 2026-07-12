-- Rivox Communication Center v2
-- Adds private chats, groups, community spaces, staff directory access,
-- automatic membership for new staff, read tracking, and safe realtime setup.

create extension if not exists pgcrypto;

-- Existing tables are preserved and upgraded in place.
alter table public.communication_channels
  add column if not exists channel_type text,
  add column if not exists auto_join boolean not null default false,
  add column if not exists last_message_at timestamptz;

update public.communication_channels
set channel_type = case
  when kind = 'announcement' then 'community'
  else 'group'
end
where channel_type is null;

alter table public.communication_channels
  alter column channel_type set default 'community';

alter table public.communication_channels
  alter column channel_type set not null;

alter table public.communication_channels
  drop constraint if exists communication_channels_channel_type_check;

alter table public.communication_channels
  add constraint communication_channels_channel_type_check
  check (channel_type in ('direct','group','community'));

-- The old kind constraint was too narrow for the new messenger.
alter table public.communication_channels
  drop constraint if exists communication_channels_kind_check;

alter table public.communication_channels
  add constraint communication_channels_kind_check
  check (kind in ('team','support','finance','announcement','direct','community'));

create table if not exists public.communication_channel_members (
  channel_id uuid not null references public.communication_channels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key (channel_id, user_id)
);

create index if not exists communication_channel_members_user_idx
  on public.communication_channel_members(user_id, channel_id);

create index if not exists communication_channels_type_updated_idx
  on public.communication_channels(channel_type, last_message_at desc nulls last, created_at desc);

alter table public.communication_channel_members enable row level security;

create or replace function public.is_communication_channel_member(p_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.communication_channel_members cm
    where cm.channel_id = p_channel_id and cm.user_id = auth.uid()
  );
$$;

grant execute on function public.is_communication_channel_member(uuid) to authenticated;

-- Active staff need a safe directory so personal chat can show all team members.
drop policy if exists staff_read_active_team_directory on public.admin_team_members;
create policy staff_read_active_team_directory
on public.admin_team_members
for select to authenticated
using (
  status = 'active'
  and (public.is_rivox_owner_admin() or public.is_rivox_active_staff())
);

-- Channel visibility: community is open internally, groups/direct chats require membership.
drop policy if exists internal_read_channels on public.communication_channels;
create policy internal_read_channels
on public.communication_channels
for select to authenticated
using (
  public.is_rivox_owner_admin()
  or (
    public.is_rivox_active_staff()
    and (
      channel_type = 'community'
      or public.is_communication_channel_member(communication_channels.id)
    )
  )
);

-- Owner manages all channels. Active staff can create only via secured RPC functions.
drop policy if exists owner_manage_channels on public.communication_channels;
create policy owner_manage_channels
on public.communication_channels
for all to authenticated
using (public.is_rivox_owner_admin())
with check (public.is_rivox_owner_admin());

-- Membership rows are visible only to internal users for channels they can access.
drop policy if exists internal_read_communication_members on public.communication_channel_members;
create policy internal_read_communication_members
on public.communication_channel_members
for select to authenticated
using (
  public.is_rivox_owner_admin()
  or (
    public.is_rivox_active_staff()
    and exists (
      select 1
      from public.communication_channels cc
      where cc.id = communication_channel_members.channel_id
        and (cc.channel_type = 'community' or public.is_communication_channel_member(cc.id))
    )
  )
);

-- Message access follows the conversation membership.
drop policy if exists internal_read_messages on public.communication_messages;
create policy internal_read_messages
on public.communication_messages
for select to authenticated
using (
  public.is_rivox_owner_admin()
  or (
    public.is_rivox_active_staff()
    and exists (
      select 1
      from public.communication_channels cc
      where cc.id = communication_messages.channel_id
        and (cc.channel_type = 'community' or public.is_communication_channel_member(cc.id))
    )
  )
);

drop policy if exists internal_send_messages on public.communication_messages;
create policy internal_send_messages
on public.communication_messages
for insert to authenticated
with check (
  sender_user_id = auth.uid()
  and (
    public.is_rivox_owner_admin()
    or (
      public.is_rivox_active_staff()
      and exists (
        select 1
        from public.communication_channels cc
        where cc.id = communication_messages.channel_id
          and (cc.channel_type = 'community' or public.is_communication_channel_member(cc.id))
      )
    )
  )
);

-- Default spaces.
insert into public.communication_channels (name, description, kind, channel_type, auto_join, created_by)
values
  ('Rivox Community', 'Company-wide community for everyone at Rivox.', 'community', 'community', true, null),
  ('All Staff', 'Daily work coordination for the complete Rivox team.', 'team', 'group', true, null),
  ('Announcements', 'Official company news and important updates.', 'announcement', 'community', true, null)
on conflict (name) do update
set channel_type = excluded.channel_type,
    auto_join = excluded.auto_join,
    description = excluded.description,
    kind = excluded.kind;

-- Existing legacy channels remain available as groups/community.
update public.communication_channels
set auto_join = true
where name in ('general','support-desk','finance-ops','announcements')
  and channel_type <> 'direct';

-- Resolve the owner auth user safely from the configured owner email.
create or replace function public.rivox_owner_user_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.id
  from auth.users u
  where lower(u.email) = lower(coalesce(
    (select value #>> '{}' from public.admin_system_settings where key = 'owner_admin_email' limit 1),
    'mz7123272@gmail.com'
  ))
  limit 1;
$$;

grant execute on function public.rivox_owner_user_id() to authenticated;

-- Ensures current user is present in all auto-join spaces.
create or replace function public.ensure_current_communication_membership(
  p_display_name text,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not (public.is_rivox_owner_admin() or public.is_rivox_active_staff()) then
    raise exception 'Communication access denied';
  end if;

  insert into public.communication_channel_members(channel_id, user_id, display_name, role)
  select cc.id, auth.uid(), nullif(trim(p_display_name), ''), nullif(trim(p_role), '')
  from public.communication_channels cc
  where cc.archived = false and cc.auto_join = true
  on conflict (channel_id, user_id) do update
    set display_name = excluded.display_name,
        role = excluded.role;
end;
$$;

grant execute on function public.ensure_current_communication_membership(text,text) to authenticated;

-- Create or reuse one personal conversation between exactly two users.
create or replace function public.get_or_create_direct_conversation(
  p_target_team_member_id uuid default null,
  p_target_owner boolean default false,
  p_current_display_name text default 'Team member',
  p_current_role text default 'staff'
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_current uuid := auth.uid();
  v_target uuid;
  v_target_name text;
  v_target_role text;
  v_channel uuid;
begin
  if v_current is null or not (public.is_rivox_owner_admin() or public.is_rivox_active_staff()) then
    raise exception 'Communication access denied';
  end if;

  if p_target_owner then
    v_target := public.rivox_owner_user_id();
    v_target_name := 'Owner Admin';
    v_target_role := 'owner_admin';
  else
    select tm.auth_user_id, coalesce(nullif(tm.name,''), tm.email), tm.role
    into v_target, v_target_name, v_target_role
    from public.admin_team_members tm
    where tm.id = p_target_team_member_id and tm.status = 'active';
  end if;

  if v_target is null then raise exception 'Selected team member does not have an active login account'; end if;
  if v_target = v_current then raise exception 'You cannot create a personal chat with yourself'; end if;

  select cc.id into v_channel
  from public.communication_channels cc
  where cc.channel_type = 'direct'
    and exists (select 1 from public.communication_channel_members a where a.channel_id = cc.id and a.user_id = v_current)
    and exists (select 1 from public.communication_channel_members b where b.channel_id = cc.id and b.user_id = v_target)
    and 2 = (select count(*) from public.communication_channel_members c where c.channel_id = cc.id)
  limit 1;

  if v_channel is null then
    insert into public.communication_channels(name, description, kind, channel_type, auto_join, created_by)
    values ('direct-' || replace(gen_random_uuid()::text, '-', ''), 'Private Rivox conversation', 'direct', 'direct', false, v_current)
    returning id into v_channel;
  end if;

  insert into public.communication_channel_members(channel_id,user_id,display_name,role)
  values
    (v_channel, v_current, coalesce(nullif(trim(p_current_display_name),''),'Team member'), coalesce(nullif(trim(p_current_role),''),'staff')),
    (v_channel, v_target, v_target_name, v_target_role)
  on conflict (channel_id,user_id) do update
    set display_name = excluded.display_name, role = excluded.role;

  return v_channel;
end;
$$;

grant execute on function public.get_or_create_direct_conversation(uuid,boolean,text,text) to authenticated;

-- Admin/full-access staff can create team groups.
create or replace function public.create_communication_group(
  p_name text,
  p_description text default null,
  p_auto_join boolean default true,
  p_creator_name text default 'Team member',
  p_creator_role text default 'staff'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_channel uuid;
  v_allowed boolean;
begin
  select public.is_rivox_owner_admin() or exists (
    select 1 from public.admin_team_members tm
    where tm.status = 'active'
      and tm.role = 'full_access'
      and (tm.auth_user_id = auth.uid() or lower(tm.email) = lower(coalesce(auth.jwt()->>'email','')))
  ) into v_allowed;

  if auth.uid() is null or not v_allowed then raise exception 'Only the owner or full-access staff can create groups'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'Group name is required'; end if;

  insert into public.communication_channels(name,description,kind,channel_type,auto_join,created_by)
  values (trim(p_name), nullif(trim(p_description),''), 'team', 'group', p_auto_join, auth.uid())
  returning id into v_channel;

  if p_auto_join then
    insert into public.communication_channel_members(channel_id,user_id,display_name,role)
    select v_channel, tm.auth_user_id, coalesce(nullif(tm.name,''),tm.email), tm.role
    from public.admin_team_members tm
    where tm.status='active' and tm.auth_user_id is not null
    on conflict do nothing;

    if public.rivox_owner_user_id() is not null then
      insert into public.communication_channel_members(channel_id,user_id,display_name,role)
      values (v_channel,public.rivox_owner_user_id(),'Owner Admin','owner_admin')
      on conflict do nothing;
    end if;
  else
    insert into public.communication_channel_members(channel_id,user_id,display_name,role)
    values (v_channel,auth.uid(),coalesce(nullif(trim(p_creator_name),''),'Team member'),coalesce(nullif(trim(p_creator_role),''),'staff'))
    on conflict do nothing;
  end if;

  return v_channel;
end;
$$;

grant execute on function public.create_communication_group(text,text,boolean,text,text) to authenticated;

create or replace function public.mark_communication_read(p_channel_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.communication_channel_members
  set last_read_at = now()
  where channel_id = p_channel_id and user_id = auth.uid();
end;
$$;

grant execute on function public.mark_communication_read(uuid) to authenticated;

-- Keep conversation order current.
create or replace function public.touch_communication_channel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.communication_channels set last_message_at = new.created_at where id = new.channel_id;
  return new;
end;
$$;

drop trigger if exists communication_message_touch_channel on public.communication_messages;
create trigger communication_message_touch_channel
after insert on public.communication_messages
for each row execute function public.touch_communication_channel();

-- Automatically add each newly activated staff account to default spaces.
create or replace function public.auto_join_new_staff_to_communication()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active' and new.auth_user_id is not null then
    insert into public.communication_channel_members(channel_id,user_id,display_name,role)
    select cc.id,new.auth_user_id,coalesce(nullif(new.name,''),new.email),new.role
    from public.communication_channels cc
    where cc.archived=false and cc.auto_join=true
    on conflict (channel_id,user_id) do update
      set display_name=excluded.display_name,role=excluded.role;
  end if;
  return new;
end;
$$;

drop trigger if exists admin_team_members_auto_join_communication on public.admin_team_members;
create trigger admin_team_members_auto_join_communication
after insert or update of auth_user_id,status,name,role on public.admin_team_members
for each row execute function public.auto_join_new_staff_to_communication();

-- Backfill current staff and owner into default spaces.
insert into public.communication_channel_members(channel_id,user_id,display_name,role)
select cc.id,tm.auth_user_id,coalesce(nullif(tm.name,''),tm.email),tm.role
from public.communication_channels cc
cross join public.admin_team_members tm
where cc.archived=false and cc.auto_join=true and tm.status='active' and tm.auth_user_id is not null
on conflict (channel_id,user_id) do update set display_name=excluded.display_name,role=excluded.role;

insert into public.communication_channel_members(channel_id,user_id,display_name,role)
select cc.id,public.rivox_owner_user_id(),'Owner Admin','owner_admin'
from public.communication_channels cc
where cc.archived=false and cc.auto_join=true and public.rivox_owner_user_id() is not null
on conflict (channel_id,user_id) do nothing;

-- Safe realtime publication setup (prevents duplicate-member error).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='communication_messages'
  ) then
    alter publication supabase_realtime add table public.communication_messages;
  end if;
end $$;
