-- Rivox Security & Risk Center V2

alter table public.admin_active_sessions
  add column if not exists session_key text,
  add column if not exists status text not null default 'active'
    check (status in ('active','revoked','expired')),
  add column if not exists revoked_at timestamptz,
  add column if not exists revoke_reason text;

create unique index if not exists idx_admin_active_sessions_session_key
  on public.admin_active_sessions(session_key)
  where session_key is not null;
create index if not exists idx_admin_active_sessions_status_seen
  on public.admin_active_sessions(status,last_seen_at desc);

alter table public.admin_security_events
  add column if not exists severity text not null default 'info'
    check (severity in ('info','warning','critical')),
  add column if not exists resolved_at timestamptz;

drop policy if exists "users_manage_own_active_session" on public.admin_active_sessions;
create policy "users_manage_own_active_session"
on public.admin_active_sessions for all to authenticated
using (user_id=auth.uid())
with check (user_id=auth.uid());

drop policy if exists "users_insert_own_security_event" on public.admin_security_events;
create policy "users_insert_own_security_event"
on public.admin_security_events for insert to authenticated
with check (actor_user_id=auth.uid());

grant select,insert,update on public.admin_active_sessions to authenticated;
grant insert on public.admin_security_events to authenticated;

