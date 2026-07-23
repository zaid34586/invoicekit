-- Rivox Billing Activation Recovery
-- Tracks delayed Paddle activations without ever granting a plan from an
-- unverified browser event. Only the service role writes incidents.

create table if not exists public.billing_activation_incidents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_id text not null,
  provider_environment text not null default 'production'
    check (provider_environment in ('sandbox','production')),
  expected_plan text check (expected_plan is null or expected_plan in ('pro','business')),
  status text not null default 'detecting'
    check (status in ('detecting','verifying','activated','manual_review','resolved')),
  severity text not null default 'warning'
    check (severity in ('warning','critical')),
  paddle_status text,
  attempts integer not null default 1,
  error_message text,
  assigned_to uuid references public.admin_team_members(id) on delete set null,
  first_detected_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  notified_at timestamptz,
  activated_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(transaction_id, provider_environment)
);

create index if not exists idx_billing_activation_incidents_queue
  on public.billing_activation_incidents(status, severity, last_checked_at desc);
create index if not exists idx_billing_activation_incidents_user
  on public.billing_activation_incidents(user_id, created_at desc);
create index if not exists idx_billing_activation_incidents_assignee
  on public.billing_activation_incidents(assigned_to, status);

alter table public.billing_activation_incidents enable row level security;

drop policy if exists "owner_manage_billing_activation_incidents" on public.billing_activation_incidents;
create policy "owner_manage_billing_activation_incidents"
on public.billing_activation_incidents for all
using ((select auth.jwt()->>'email') = 'mz7123272@gmail.com')
with check ((select auth.jwt()->>'email') = 'mz7123272@gmail.com');

drop policy if exists "users_read_own_billing_activation_incidents" on public.billing_activation_incidents;
create policy "users_read_own_billing_activation_incidents"
on public.billing_activation_incidents for select
using (auth.uid() = user_id);

create or replace function public.assign_billing_activation_incident()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare v_agent uuid;
begin
  new.updated_at := now();
  if new.assigned_to is null and new.status in ('detecting','verifying','manual_review') then
    select member.id into v_agent
    from public.admin_team_members member
    left join public.billing_activation_incidents incident
      on incident.assigned_to=member.id
     and incident.status in ('detecting','verifying','manual_review')
    where member.status='active'
      and member.role in ('support','full_access','finance')
    group by member.id, member.created_at
    order by count(incident.id), member.created_at
    limit 1;
    new.assigned_to := v_agent;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_assign_billing_activation_incident
  on public.billing_activation_incidents;
create trigger trg_assign_billing_activation_incident
before insert or update on public.billing_activation_incidents
for each row execute function public.assign_billing_activation_incident();

revoke all on table public.billing_activation_incidents from anon;
grant select on table public.billing_activation_incidents to authenticated;
grant all on table public.billing_activation_incidents to service_role;
