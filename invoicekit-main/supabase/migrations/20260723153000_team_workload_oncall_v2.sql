-- Rivox Team Workload & On-call Command Center

alter table public.admin_team_members
  add column if not exists availability text not null default 'available'
    check (availability in ('available','busy','offline','on_leave')),
  add column if not exists on_call boolean not null default false,
  add column if not exists skills text[] not null default '{}',
  add column if not exists max_active_cases integer not null default 10
    check (max_active_cases between 1 and 100),
  add column if not exists availability_updated_at timestamptz not null default now();

create index if not exists idx_admin_team_availability
  on public.admin_team_members(status,availability,on_call);

create or replace function public.select_available_ops_member(p_roles text[])
returns uuid
language sql
stable
security definer
set search_path=public
as $$
  select member.id
  from public.admin_team_members member
  where member.status='active'
    and member.availability in ('available','busy')
    and member.role=any(p_roles)
    and (
      (select count(*) from public.admin_support_tickets t where t.assigned_to=member.id and t.status not in ('resolved','closed'))
      +(select count(*) from public.billing_activation_incidents b where b.assigned_to=member.id and b.status in ('detecting','verifying','manual_review'))
      +(select count(*) from public.admin_system_incidents s where s.assigned_to=member.id and s.status in ('open','acknowledged','investigating'))
      +(select count(*) from public.admin_tasks a where a.assigned_to=member.id and a.status in ('pending','in_progress','blocked'))
    ) < member.max_active_cases
  order by member.on_call desc,
    case member.availability when 'available' then 0 else 1 end,
    (
      (select count(*) from public.admin_support_tickets t where t.assigned_to=member.id and t.status not in ('resolved','closed'))
      +(select count(*) from public.billing_activation_incidents b where b.assigned_to=member.id and b.status in ('detecting','verifying','manual_review'))
      +(select count(*) from public.admin_system_incidents s where s.assigned_to=member.id and s.status in ('open','acknowledged','investigating'))
      +(select count(*) from public.admin_tasks a where a.assigned_to=member.id and a.status in ('pending','in_progress','blocked'))
    ),
    member.created_at
  limit 1;
$$;

create or replace function public.prepare_support_ticket_v2()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  new.sla_target_minutes := coalesce(new.sla_target_minutes,
    case lower(coalesce(new.plan_at_creation,'free')) when 'business' then 60 when 'pro' then 120 else 1440 end);
  new.sla_due_at := coalesce(new.sla_due_at,coalesce(new.created_at,now())+make_interval(mins=>new.sla_target_minutes));
  new.last_customer_reply_at := coalesce(new.last_customer_reply_at,coalesce(new.created_at,now()));
  if new.assigned_to is null then
    new.assigned_to := public.select_available_ops_member(array['support','full_access','limited']);
  end if;
  return new;
end $$;

create or replace function public.assign_billing_activation_incident()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  new.updated_at=now();
  if new.assigned_to is null and new.status in ('detecting','verifying','manual_review') then
    new.assigned_to := public.select_available_ops_member(array['support','full_access','finance']);
  end if;
  return new;
end $$;

create or replace function public.assign_system_incident_v2()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  new.updated_at=now();
  if new.assigned_to is null and new.status<>'resolved' then
    new.assigned_to := public.select_available_ops_member(array['full_access','support','limited']);
  end if;
  return new;
end $$;

revoke all on function public.select_available_ops_member(text[]) from public;
grant execute on function public.select_available_ops_member(text[]) to service_role;

