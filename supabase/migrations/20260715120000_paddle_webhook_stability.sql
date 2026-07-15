-- Rivox Paddle stability: retain the source environment on every billing event.
alter table public.billing_events
  add column if not exists provider_environment text not null default 'production'
    check (provider_environment in ('sandbox','production'));

create index if not exists billing_events_provider_environment_idx
  on public.billing_events(provider, provider_environment, user_id, created_at desc);
