-- Add Stripe BYOG and refund reconciliation to invoice payments.

alter table public.payment_gateway_connections
  drop constraint if exists payment_gateway_connections_provider_check;
alter table public.payment_gateway_connections
  add constraint payment_gateway_connections_provider_check
  check (provider in ('paypal','stripe'));

alter table public.payment_gateway_connections
  add column if not exists encrypted_webhook_secret text,
  add column if not exists webhook_secret_iv text,
  add column if not exists account_id text,
  add column if not exists account_country text;

alter table public.invoice_payments
  drop constraint if exists invoice_payments_provider_check;
alter table public.invoice_payments
  add constraint invoice_payments_provider_check
  check (provider in ('paypal','stripe'));

alter table public.invoice_payments
  add column if not exists refunded_amount numeric(18,2) not null default 0,
  add column if not exists refunded_at timestamptz,
  add column if not exists gateway_connection_id uuid references public.payment_gateway_connections(id) on delete set null;

alter table public.invoices
  add column if not exists refunded_amount numeric(18,2) not null default 0;

create index if not exists invoice_payments_workspace_created_idx
  on public.invoice_payments(workspace_id, created_at desc);
