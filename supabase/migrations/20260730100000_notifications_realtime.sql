-- Without this, the new realtime subscriptions added to StaffLayout.tsx and
-- StaffDashboard.tsx (for live notification badge/list updates + sound)
-- would silently never fire — Postgres only broadcasts row changes for
-- tables explicitly added to the "supabase_realtime" publication, and
-- "notifications" was never added (only communication_messages was, for
-- chat). Same safe/idempotent pattern already used elsewhere in this repo.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
