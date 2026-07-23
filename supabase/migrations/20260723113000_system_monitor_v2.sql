-- Rivox System Monitor V2

create table if not exists public.admin_system_incidents (
  id uuid primary key default gen_random_uuid(),
  service_name text not null,
  title text not null,
  description text,
  severity text not null default 'warning'
    check (severity in ('info','warning','critical')),
  status text not null default 'open'
    check (status in ('open','acknowledged','investigating','resolved')),
  assigned_to uuid references public.admin_team_members(id) on delete set null,
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  occurrence_count integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_system_incidents_queue
  on public.admin_system_incidents(status,severity,last_detected_at desc);
create index if not exists idx_system_incidents_service
  on public.admin_system_incidents(service_name,created_at desc);
create unique index if not exists idx_system_incidents_one_active
  on public.admin_system_incidents(service_name)
  where status in ('open','acknowledged','investigating');

alter table public.admin_system_incidents enable row level security;

drop policy if exists "owner_manage_system_incidents" on public.admin_system_incidents;
create policy "owner_manage_system_incidents"
on public.admin_system_incidents for all to authenticated
using (lower(auth.jwt()->>'email')='mz7123272@gmail.com')
with check (lower(auth.jwt()->>'email')='mz7123272@gmail.com');

create or replace function public.assign_system_incident_v2()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_agent uuid;
begin
  new.updated_at=now();
  if new.assigned_to is null and new.status<>'resolved' then
    select member.id into v_agent
    from public.admin_team_members member
    left join public.admin_system_incidents incident
      on incident.assigned_to=member.id
     and incident.status in ('open','acknowledged','investigating')
    where member.status='active'
      and member.role in ('full_access','support','limited')
    group by member.id,member.created_at
    order by count(incident.id),member.created_at
    limit 1;
    new.assigned_to=v_agent;
  end if;
  return new;
end $$;

drop trigger if exists trg_assign_system_incident_v2 on public.admin_system_incidents;
create trigger trg_assign_system_incident_v2
before insert or update on public.admin_system_incidents
for each row execute function public.assign_system_incident_v2();

grant select,update on public.admin_system_incidents to authenticated;
grant all on public.admin_system_incidents to service_role;
grant all on public.admin_system_health_checks to service_role;

