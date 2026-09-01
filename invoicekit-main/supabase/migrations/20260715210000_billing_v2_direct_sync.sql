-- Billing V2 direct transaction verification support.
-- Safe to run repeatedly.

alter table public.subscriptions
  add column if not exists provider_environment text not null default 'production'
    check (provider_environment in ('sandbox', 'production'));

alter table public.billing_events
  add column if not exists provider_environment text not null default 'production'
    check (provider_environment in ('sandbox', 'production'));

-- The existing billing schema allows one active provider subscription per user.
create unique index if not exists subscriptions_user_id_uidx
  on public.subscriptions(user_id);

create unique index if not exists billing_events_provider_event_id_uidx
  on public.billing_events(provider_event_id);

create index if not exists billing_events_user_provider_created_idx
  on public.billing_events(user_id, provider, created_at desc);
