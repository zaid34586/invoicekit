-- Rivox Part 10: role governance and a database-backed audit trail.
-- Safe to apply after the existing admin operations migrations.

alter table public.admin_team_members
  add column if not exists role_updated_at timestamptz not null default now(),
  add column if not exists status_updated_at timestamptz not null default now();

create or replace function public.audit_admin_team_member_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_action text;
  changed_details jsonb;
begin
  if new.role is distinct from old.role then
    changed_action := 'team_member_access_changed';
    changed_details := jsonb_build_object('email', new.email, 'previous_role', old.role, 'new_role', new.role);
    new.role_updated_at := now();
  elsif new.status is distinct from old.status then
    changed_action := 'team_member_status_changed';
    changed_details := jsonb_build_object('email', new.email, 'previous_status', old.status, 'new_status', new.status);
    new.status_updated_at := now();
  end if;

  if changed_action is not null then
    insert into public.admin_audit_logs (actor_user_id, action, target_type, target_id, details)
    values (auth.uid(), changed_action, 'admin_team_member', new.id::text, changed_details);
  end if;
  return new;
end;
$$;

drop trigger if exists admin_team_member_access_audit on public.admin_team_members;
create trigger admin_team_member_access_audit
before update of role, status on public.admin_team_members
for each row execute function public.audit_admin_team_member_change();

-- Audit records are append-only for signed-in users. The owner may read and add
-- explicit review events, but cannot silently edit or delete historical records.
drop policy if exists "admin_manage_audit_logs" on public.admin_audit_logs;
drop policy if exists "admin_insert_audit_logs" on public.admin_audit_logs;
create policy "admin_insert_audit_logs" on public.admin_audit_logs for insert
  to authenticated
  with check (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');

create index if not exists idx_admin_audit_action_created_at
  on public.admin_audit_logs(action, created_at desc);
create index if not exists idx_admin_team_members_role_status
  on public.admin_team_members(role, status);
