-- Allow PostgREST upsert(on_conflict=session_key).
-- PostgreSQL UNIQUE still permits multiple NULL values.
drop index if exists public.idx_admin_active_sessions_session_key;
create unique index if not exists idx_admin_active_sessions_session_key
  on public.admin_active_sessions(session_key);
