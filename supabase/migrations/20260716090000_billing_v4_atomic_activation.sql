-- Rivox Billing V4: one JSON RPC for verified Paddle activation.
-- Removes fragile multi-parameter RPC signature matching.

alter table public.subscriptions
  add column if not exists provider_environment text not null default 'production';

alter table public.billing_events
  add column if not exists provider_environment text not null default 'production';

-- The app supports one Paddle subscription per user/environment.
alter table public.subscriptions drop constraint if exists subscriptions_user_id_key;
drop index if exists public.subscriptions_user_id_uidx;
alter table public.subscriptions drop constraint if exists subscriptions_user_provider_environment_key;
alter table public.subscriptions
  add constraint subscriptions_user_provider_environment_key
  unique (user_id, provider_environment);

create unique index if not exists billing_events_provider_event_id_uidx
  on public.billing_events(provider_event_id);

create or replace function public.activate_paddle_transaction_v4(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := nullif(p_payload->>'user_id','')::uuid;
  v_environment text := lower(coalesce(p_payload->>'environment','production'));
  v_transaction_id text := p_payload->>'transaction_id';
  v_subscription_id text := p_payload->>'subscription_id';
  v_customer_id text := p_payload->>'customer_id';
  v_plan text := lower(p_payload->>'plan');
  v_billing_cycle text := p_payload->>'billing_cycle';
  v_status text := coalesce(p_payload->>'status','active');
  v_currency text := p_payload->>'currency';
  v_amount numeric := coalesce(nullif(p_payload->>'amount','')::numeric,0);
  v_customer_email text := p_payload->>'customer_email';
  v_renews_at timestamptz := nullif(p_payload->>'renews_at','')::timestamptz;
  v_product_id text := p_payload->>'product_id';
  v_price_id text := p_payload->>'price_id';
  v_raw jsonb := coalesce(p_payload->'raw_payload','{}'::jsonb);
  v_subscription_row uuid;
  v_profile_id uuid;
begin
  if v_user_id is null or not exists (select 1 from auth.users where id=v_user_id) then
    raise exception 'Billing V4: authenticated user does not exist';
  end if;
  if v_environment not in ('sandbox','production') then
    raise exception 'Billing V4: invalid environment %', v_environment;
  end if;
  if v_plan not in ('pro','business') then
    raise exception 'Billing V4: invalid plan %', v_plan;
  end if;
  if coalesce(v_transaction_id,'')='' or coalesce(v_subscription_id,'')='' or coalesce(v_customer_id,'')='' then
    raise exception 'Billing V4: transaction, subscription and customer IDs are required';
  end if;

  -- Lock the profile row to prevent parallel activation races.
  select id into v_profile_id
  from public.profiles
  where user_id=v_user_id or id=v_user_id
  order by case when user_id=v_user_id then 0 else 1 end
  limit 1
  for update;

  if v_profile_id is null then
    raise exception 'Billing V4: no profile linked to auth user %', v_user_id;
  end if;

  insert into public.subscriptions (
    user_id, provider, provider_environment, provider_subscription_id,
    provider_customer_id, provider_order_id, product_id, variant_id,
    plan, billing_cycle, status, customer_email, currency, amount,
    renews_at, cancelled, raw_payload, updated_at
  ) values (
    v_user_id, 'paddle', v_environment, v_subscription_id,
    v_customer_id, v_transaction_id, v_product_id, v_price_id,
    v_plan, v_billing_cycle, v_status, v_customer_email, v_currency,
    v_amount, v_renews_at, false, v_raw, now()
  )
  on conflict (user_id, provider_environment) do update set
    provider='paddle',
    provider_subscription_id=excluded.provider_subscription_id,
    provider_customer_id=excluded.provider_customer_id,
    provider_order_id=excluded.provider_order_id,
    product_id=excluded.product_id,
    variant_id=excluded.variant_id,
    plan=excluded.plan,
    billing_cycle=excluded.billing_cycle,
    status=excluded.status,
    customer_email=excluded.customer_email,
    currency=excluded.currency,
    amount=excluded.amount,
    renews_at=excluded.renews_at,
    cancelled=false,
    raw_payload=excluded.raw_payload,
    updated_at=now()
  returning id into v_subscription_row;

  insert into public.billing_events (
    provider_event_id,user_id,provider,provider_environment,event_name,
    order_id,subscription_id,plan,billing_cycle,amount,currency,status,
    raw_payload,created_at
  ) values (
    'transaction-sync:'||v_transaction_id,v_user_id,'paddle',v_environment,
    'transaction.synced',v_transaction_id,v_subscription_id,v_plan,
    v_billing_cycle,v_amount,v_currency,'completed',v_raw,now()
  )
  on conflict (provider_event_id) do update set
    subscription_id=excluded.subscription_id,
    status=excluded.status,
    raw_payload=excluded.raw_payload;

  update public.profiles set
    user_id=coalesce(user_id,v_user_id),
    plan=v_plan,
    is_pro=true,
    subscription_status='active',
    subscription_id=v_subscription_id,
    plan_expires_at=v_renews_at
  where id=v_profile_id;

  return jsonb_build_object(
    'ok',true,
    'subscription_row_id',v_subscription_row,
    'profile_id',v_profile_id,
    'plan',v_plan,
    'transaction_id',v_transaction_id,
    'environment',v_environment
  );
end;
$$;

revoke all on function public.activate_paddle_transaction_v4(jsonb) from public;
grant execute on function public.activate_paddle_transaction_v4(jsonb) to service_role;
