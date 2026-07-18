-- Workspace-owned invoice payment gateways (BYOG) and payment ledger.
-- Secrets are encrypted by the Edge Function before they reach Postgres.

create table if not exists public.payment_gateway_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('paypal')),
  environment text not null default 'sandbox' check (environment in ('sandbox','live')),
  public_key text not null,
  encrypted_secret text not null,
  secret_iv text not null,
  webhook_id text,
  status text not null default 'connected' check (status in ('connected','error','disabled')),
  account_email text,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists payment_gateway_one_active_per_workspace
  on public.payment_gateway_connections(workspace_id)
  where status = 'connected';

alter table public.payment_gateway_connections enable row level security;
-- Deliberately no direct table policy. Credentials are only accessed through
-- the service-role Edge Functions, which return a redacted connection status.

create table if not exists public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  provider text not null check (provider in ('paypal')),
  environment text not null check (environment in ('sandbox','live')),
  provider_order_id text not null,
  provider_capture_id text,
  amount numeric(18,2) not null check (amount > 0),
  currency text not null,
  status text not null default 'created' check (status in ('created','approved','paid','failed','refunded')),
  payer_email text,
  payer_name text,
  raw_summary jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, environment, provider_order_id),
  unique(provider, environment, provider_capture_id)
);

create index if not exists invoice_payments_invoice_idx
  on public.invoice_payments(invoice_id, created_at desc);

alter table public.invoice_payments enable row level security;

drop policy if exists "owners_read_invoice_payments" on public.invoice_payments;
create policy "owners_read_invoice_payments"
  on public.invoice_payments for select to authenticated
  using (owner_user_id = auth.uid());

-- Idempotency ledger for PayPal webhook deliveries.
create table if not exists public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  event_type text not null,
  processed_at timestamptz not null default now(),
  unique(provider, event_id)
);

alter table public.payment_webhook_events enable row level security;

-- Customer users can read their own notifications in the existing bell UI.
drop policy if exists "users_read_own_notifications" on public.notifications;
create policy "users_read_own_notifications" on public.notifications for select
  to authenticated using (recipient_user_id = auth.uid() and audience in ('user','all'));

drop policy if exists "users_update_own_notifications" on public.notifications;
create policy "users_update_own_notifications" on public.notifications for update
  to authenticated using (recipient_user_id = auth.uid() and audience in ('user','all'))
  with check (recipient_user_id = auth.uid() and audience in ('user','all'));

