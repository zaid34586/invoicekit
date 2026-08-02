-- Fix: neither support_ticket_messages nor admin_support_tickets were ever
-- added to the supabase_realtime publication (only communication_messages
-- and notifications were, in earlier migrations). Postgres only broadcasts
-- row changes for tables explicitly in that publication -- every realtime
-- subscription anyone wrote against ticket messages/status (staff workspace,
-- customer Support page) was silently a no-op. This is the actual root
-- cause of "reply doesn't show until I refresh" on both sides.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='support_ticket_messages'
  ) then
    alter publication supabase_realtime add table public.support_ticket_messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='admin_support_tickets'
  ) then
    alter publication supabase_realtime add table public.admin_support_tickets;
  end if;
end $$;
