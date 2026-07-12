-- Rivox subscription automation engine.
-- Safe to run multiple times.

create table if not exists public.subscription_automation_rules (
  id uuid primary key default gen_random_uuid(),
  rule_type text not null unique check (rule_type in ('renewal_reminder','trial_ending','payment_failed','subscription_cancelled')),
  enabled boolean not null default true,
  days_before integer not null default 0 check (days_before between 0 and 60),
  subject_template text not null,
  body_template text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.subscription_automation_rules (rule_type, enabled, days_before, subject_template, body_template)
values
  ('renewal_reminder', true, 3, 'Your Rivox {{plan}} plan renews soon', 'Hi {{name}}, your Rivox {{plan}} subscription renews on {{date}}. No action is needed if you want to continue.'),
  ('trial_ending', true, 3, 'Your Rivox trial ends soon', 'Hi {{name}}, your Rivox trial ends on {{date}}. Choose a plan to keep your workspace active.'),
  ('payment_failed', true, 0, 'Action required: Rivox payment failed', 'Hi {{name}}, we could not process your Rivox {{plan}} payment. Please update your payment method to avoid interruption.'),
  ('subscription_cancelled', true, 0, 'Your Rivox subscription was cancelled', 'Hi {{name}}, your Rivox {{plan}} subscription has been cancelled. Access remains available until {{date}}.')
on conflict (rule_type) do nothing;

create table if not exists public.subscription_automation_runs (
  id uuid primary key default gen_random_uuid(),
  run_type text not null default 'scheduled',
  status text not null default 'running' check (status in ('running','completed','failed','simulated')),
  processed_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.subscription_automation_deliveries (
  id uuid primary key default gen_random_uuid(),
  rule_type text not null,
  user_id uuid references auth.users(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete cascade,
  billing_event_id uuid references public.billing_events(id) on delete cascade,
  dedupe_key text not null unique,
  recipient_email text,
  status text not null default 'pending' check (status in ('pending','sent','failed','simulated','skipped')),
  provider_message_id text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists subscription_automation_runs_created_idx on public.subscription_automation_runs(created_at desc);
create index if not exists subscription_automation_deliveries_user_idx on public.subscription_automation_deliveries(user_id, created_at desc);

alter table public.subscription_automation_rules enable row level security;
alter table public.subscription_automation_runs enable row level security;
alter table public.subscription_automation_deliveries enable row level security;

drop policy if exists owner_manage_subscription_automation_rules on public.subscription_automation_rules;
create policy owner_manage_subscription_automation_rules on public.subscription_automation_rules for all to authenticated
using (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com')
with check (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');

drop policy if exists owner_read_subscription_automation_runs on public.subscription_automation_runs;
create policy owner_read_subscription_automation_runs on public.subscription_automation_runs for select to authenticated
using (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');

drop policy if exists owner_read_subscription_automation_deliveries on public.subscription_automation_deliveries;
create policy owner_read_subscription_automation_deliveries on public.subscription_automation_deliveries for select to authenticated
using (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');

grant select, update on public.subscription_automation_rules to authenticated;
grant select on public.subscription_automation_runs, public.subscription_automation_deliveries to authenticated;
