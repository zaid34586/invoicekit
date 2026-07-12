-- Phase 8: subscription lifecycle metadata and billing receipt support.
-- Safe to run on an existing Rivox database.

alter table public.subscriptions
  add column if not exists last_portal_opened_at timestamptz,
  add column if not exists cancellation_requested_at timestamptz,
  add column if not exists cancellation_effective_at timestamptz;

alter table public.billing_events
  add column if not exists receipt_url text;

create index if not exists subscriptions_user_provider_idx
  on public.subscriptions(user_id, provider);

create index if not exists billing_events_user_provider_created_idx
  on public.billing_events(user_id, provider, created_at desc);
