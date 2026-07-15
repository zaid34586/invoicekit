-- Rivox Paddle root-cause repair. Safe to run repeatedly.

alter table public.subscriptions
  add column if not exists provider_environment text not null default 'production'
    check (provider_environment in ('sandbox', 'production'));

alter table public.billing_events
  add column if not exists provider_environment text not null default 'production'
    check (provider_environment in ('sandbox', 'production'));

-- subscriptions.user_id was created UNIQUE, so webhook upserts must conflict on user_id.
create unique index if not exists subscriptions_user_id_uidx
  on public.subscriptions(user_id);

create index if not exists subscriptions_provider_environment_idx
  on public.subscriptions(provider, provider_environment, user_id);

create index if not exists billing_events_provider_environment_idx
  on public.billing_events(provider, provider_environment, user_id, created_at desc);
