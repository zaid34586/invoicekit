alter table public.admin_support_tickets
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists sla_target_minutes integer,
  add column if not exists first_admin_reply_at timestamptz;

create index if not exists idx_support_workspace_updated
  on public.admin_support_tickets(user_id, updated_at desc);

create or replace function public.apply_support_plan_priority()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_plan text;
begin
  select lower(coalesce(plan,'free')) into v_plan
  from public.profiles where user_id=NEW.user_id or id=NEW.user_id limit 1;
  v_plan := coalesce(v_plan,'free');
  NEW.plan_at_creation := v_plan;
  NEW.priority := case when v_plan='business' then 'urgent' when v_plan='pro' then 'high' else 'medium' end;
  NEW.sla_target_minutes := case when v_plan='business' then 60 when v_plan='pro' then 120 else 1440 end;
  NEW.created_by := coalesce(NEW.created_by, auth.uid());
  return NEW;
end; $$;

drop policy if exists "customers_create_own_tickets" on public.admin_support_tickets;
drop policy if exists "customers_read_own_tickets" on public.admin_support_tickets;
drop policy if exists "customers_update_own_open_tickets" on public.admin_support_tickets;

create policy "workspace_users_create_tickets" on public.admin_support_tickets
for insert to authenticated
with check (
  user_id = public.current_workspace_owner_id()
  and created_by = auth.uid()
  and public.current_workspace_role() in ('owner','manager','accountant','staff')
);
create policy "workspace_users_read_tickets" on public.admin_support_tickets
for select to authenticated
using (
  user_id = public.current_workspace_owner_id()
  and public.current_workspace_role() in ('owner','manager','accountant','staff')
);
create policy "workspace_users_update_tickets" on public.admin_support_tickets
for update to authenticated
using (user_id = public.current_workspace_owner_id() and public.current_workspace_role() in ('owner','manager','accountant','staff'))
with check (user_id = public.current_workspace_owner_id());

drop policy if exists "customers_read_own_ticket_messages" on public.support_ticket_messages;
drop policy if exists "customers_add_own_ticket_messages" on public.support_ticket_messages;
create policy "workspace_users_read_ticket_messages" on public.support_ticket_messages
for select to authenticated using (
  is_internal=false and exists(select 1 from public.admin_support_tickets t where t.id=ticket_id and t.user_id=public.current_workspace_owner_id())
);
create policy "workspace_users_add_ticket_messages" on public.support_ticket_messages
for insert to authenticated with check (
  author_user_id=auth.uid() and author_type='customer' and is_internal=false
  and exists(select 1 from public.admin_support_tickets t where t.id=ticket_id and t.user_id=public.current_workspace_owner_id() and t.status<>'closed')
);

drop policy if exists "customers_read_own_support_attachments" on public.support_ticket_attachments;
drop policy if exists "customers_add_own_support_attachments" on public.support_ticket_attachments;
create policy "workspace_users_read_support_attachments" on public.support_ticket_attachments
for select to authenticated using (
  exists(select 1 from public.admin_support_tickets t where t.id=ticket_id and t.user_id=public.current_workspace_owner_id())
);
create policy "workspace_users_add_support_attachments" on public.support_ticket_attachments
for insert to authenticated with check (
  uploaded_by=auth.uid() and exists(select 1 from public.admin_support_tickets t where t.id=ticket_id and t.user_id=public.current_workspace_owner_id() and t.status<>'closed')
);

drop policy if exists "workspace users read support files" on storage.objects;
create policy "workspace users read support files" on storage.objects
for select to authenticated using (
  bucket_id='support-attachments' and exists(
    select 1 from public.support_ticket_attachments a
    join public.admin_support_tickets t on t.id=a.ticket_id
    where a.storage_path=name and t.user_id=public.current_workspace_owner_id()
  )
);
