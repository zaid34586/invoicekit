-- Rivox Billing V2: explicit Paddle environment and stable subscription metadata.
alter table public.subscriptions
  add column if not exists provider_environment text not null default 'production'
    check (provider_environment in ('sandbox','production'));

create index if not exists subscriptions_provider_environment_idx
  on public.subscriptions(provider, provider_environment, user_id);
