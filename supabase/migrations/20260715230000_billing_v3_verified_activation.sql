-- Billing V3: verified Paddle transaction activation.
-- First-payment activation no longer depends on webhooks.

alter table public.subscriptions
  add column if not exists provider_environment text not null default 'production',
  add column if not exists provider_order_id text,
  add column if not exists customer_email text,
  add column if not exists product_id text,
  add column if not exists variant_id text,
  add column if not exists cancellation_requested_at timestamptz,
  add column if not exists cancellation_effective_at timestamptz;

alter table public.billing_events
  add column if not exists provider_environment text not null default 'production';

create index if not exists subscriptions_user_provider_environment_idx
  on public.subscriptions(user_id, provider, provider_environment);

create index if not exists billing_events_user_provider_created_idx
  on public.billing_events(user_id, provider, created_at desc);

create or replace function public.activate_paddle_transaction_v3(
  p_user_id uuid,
  p_environment text,
  p_transaction_id text,
  p_subscription_id text,
  p_customer_id text,
  p_plan text,
  p_billing_cycle text,
  p_status text,
  p_currency text,
  p_amount numeric,
  p_customer_email text,
  p_renews_at timestamptz,
  p_product_id text,
  p_price_id text,
  p_raw_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription_id uuid;
  v_profile_count integer;
begin
  if p_environment not in ('sandbox', 'production') then
    raise exception 'Invalid Paddle environment';
  end if;
  if p_plan not in ('pro', 'business') then
    raise exception 'Invalid Rivox plan';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Auth user does not exist';
  end if;

  select id into v_subscription_id
  from public.subscriptions
  where user_id = p_user_id
    and provider = 'paddle'
    and provider_environment = p_environment
  order by updated_at desc
  limit 1;

  if v_subscription_id is null then
    insert into public.subscriptions (
      user_id, provider, provider_environment, provider_subscription_id,
      provider_customer_id, provider_order_id, product_id, variant_id,
      plan, billing_cycle, status, customer_email, currency, amount,
      renews_at, cancelled, raw_payload, updated_at
    ) values (
      p_user_id, 'paddle', p_environment, p_subscription_id,
      p_customer_id, p_transaction_id, p_product_id, p_price_id,
      p_plan, p_billing_cycle, p_status, p_customer_email, p_currency,
      p_amount, p_renews_at, false, coalesce(p_raw_payload, '{}'::jsonb), now()
    ) returning id into v_subscription_id;
  else
    update public.subscriptions set
      provider_subscription_id = p_subscription_id,
      provider_customer_id = p_customer_id,
      provider_order_id = p_transaction_id,
      product_id = p_product_id,
      variant_id = p_price_id,
      plan = p_plan,
      billing_cycle = p_billing_cycle,
      status = p_status,
      customer_email = p_customer_email,
      currency = p_currency,
      amount = p_amount,
      renews_at = p_renews_at,
      cancelled = false,
      raw_payload = coalesce(p_raw_payload, '{}'::jsonb),
      updated_at = now()
    where id = v_subscription_id;
  end if;

  insert into public.billing_events (
    provider_event_id, user_id, provider, provider_environment, event_name,
    order_id, subscription_id, plan, billing_cycle, amount, currency,
    status, raw_payload, created_at
  ) values (
    'transaction-sync:' || p_transaction_id, p_user_id, 'paddle', p_environment,
    'transaction.synced', p_transaction_id, p_subscription_id, p_plan,
    p_billing_cycle, coalesce(p_amount, 0), p_currency, 'completed',
    coalesce(p_raw_payload, '{}'::jsonb), now()
  ) on conflict (provider_event_id) do update set
    status = excluded.status,
    subscription_id = excluded.subscription_id,
    raw_payload = excluded.raw_payload;

  update public.profiles set
    plan = p_plan,
    is_pro = true,
    subscription_status = 'active',
    subscription_id = p_subscription_id,
    plan_expires_at = p_renews_at
  where user_id = p_user_id or id = p_user_id;
  get diagnostics v_profile_count = row_count;

  if v_profile_count = 0 then
    raise exception 'No profile row is linked to auth user %', p_user_id;
  end if;

  return jsonb_build_object(
    'subscription_row_id', v_subscription_id,
    'profile_rows_updated', v_profile_count,
    'plan', p_plan,
    'transaction_id', p_transaction_id
  );
end;
$$;

revoke all on function public.activate_paddle_transaction_v3(uuid,text,text,text,text,text,text,text,text,numeric,text,timestamptz,text,text,jsonb) from public;
grant execute on function public.activate_paddle_transaction_v3(uuid,text,text,text,text,text,text,text,text,numeric,text,timestamptz,text,text,jsonb) to service_role;
