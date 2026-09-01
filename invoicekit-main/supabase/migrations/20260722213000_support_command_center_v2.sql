-- Rivox Support Command Center V2
-- Adds operational workflow, SLA escalation and safe automatic assignment.

alter table public.admin_support_tickets
  add column if not exists resolution_summary text,
  add column if not exists tags text[] not null default '{}',
  add column if not exists last_customer_reply_at timestamptz,
  add column if not exists last_admin_reply_at timestamptz,
  add column if not exists sla_due_at timestamptz,
  add column if not exists sla_breached_at timestamptz,
  add column if not exists escalation_level integer not null default 0;

alter table public.admin_support_tickets
  drop constraint if exists admin_support_tickets_status_check;
alter table public.admin_support_tickets
  add constraint admin_support_tickets_status_check
  check (status in ('open','in_progress','waiting_customer','pending','resolved','closed'));

create index if not exists idx_support_active_queue
  on public.admin_support_tickets(status, priority, sla_due_at)
  where status not in ('resolved','closed');
create index if not exists idx_support_assignee_active
  on public.admin_support_tickets(assigned_to, status, updated_at desc);

create or replace function public.prepare_support_ticket_v2()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_agent uuid;
begin
  new.sla_target_minutes := coalesce(new.sla_target_minutes,
    case lower(coalesce(new.plan_at_creation,'free'))
      when 'business' then 60 when 'pro' then 120 else 1440 end);
  new.sla_due_at := coalesce(new.sla_due_at, coalesce(new.created_at,now()) + make_interval(mins => new.sla_target_minutes));
  new.last_customer_reply_at := coalesce(new.last_customer_reply_at, coalesce(new.created_at,now()));

  if new.assigned_to is null then
    select member.id into v_agent
    from public.admin_team_members member
    left join public.admin_support_tickets active
      on active.assigned_to=member.id and active.status not in ('resolved','closed')
    where member.status='active' and member.role in ('support','full_access','limited')
    group by member.id, member.created_at
    order by count(active.id), member.created_at
    limit 1;
    new.assigned_to := v_agent;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prepare_support_ticket_v2 on public.admin_support_tickets;
create trigger trg_prepare_support_ticket_v2
before insert on public.admin_support_tickets
for each row execute function public.prepare_support_ticket_v2();

create or replace function public.mark_support_sla_breaches()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare v_count integer;
begin
  with breached as (
    update public.admin_support_tickets
    set sla_breached_at=coalesce(sla_breached_at,now()),
        escalation_level=greatest(escalation_level,1),
        priority=case when priority='urgent' then priority else 'urgent' end,
        updated_at=now()
    where first_admin_reply_at is null
      and status not in ('resolved','closed')
      and coalesce(sla_due_at, created_at + make_interval(mins=>coalesce(sla_target_minutes,1440))) <= now()
      and sla_breached_at is null
    returning id, ticket_number, subject, assigned_to
  ), alerts as (
    insert into public.notifications(audience,recipient_team_member_id,type,title,body,metadata)
    select case when assigned_to is null then 'admin' else 'staff' end,
           assigned_to,
           'support_sla_breached',
           'Support SLA breached',
           coalesce(ticket_number,id::text)||' · '||subject,
           jsonb_build_object('ticket_id',id,'severity','critical')
    from breached
    returning 1
  ) select count(*) into v_count from alerts;
  return coalesce(v_count,0);
end;
$$;

revoke all on function public.mark_support_sla_breaches() from public;
grant execute on function public.mark_support_sla_breaches() to service_role;

create or replace function public.track_support_message_v2()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.is_internal then return new; end if;
  if new.author_type='customer' then
    update public.admin_support_tickets set last_customer_reply_at=new.created_at, status='open', updated_at=new.created_at where id=new.ticket_id and status<>'closed';
  else
    update public.admin_support_tickets set last_admin_reply_at=new.created_at, first_admin_reply_at=coalesce(first_admin_reply_at,new.created_at), status='waiting_customer', updated_at=new.created_at where id=new.ticket_id and status<>'closed';
  end if;
  return new;
end; $$;

drop trigger if exists trg_track_support_message_v2 on public.support_ticket_messages;
create trigger trg_track_support_message_v2
after insert on public.support_ticket_messages
for each row execute function public.track_support_message_v2();
