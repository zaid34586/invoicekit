create extension if not exists pgcrypto;

create or replace function public.is_rivox_owner_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = lower(coalesce((select value #>> '{}' from public.admin_system_settings where key = 'owner_admin_email' limit 1), 'mz7123272@gmail.com'));
$$;

create or replace function public.is_rivox_active_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_team_members tm
    where tm.status = 'active'
      and (tm.auth_user_id = auth.uid() or lower(tm.email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  );
$$;

grant execute on function public.is_rivox_owner_admin() to authenticated;
grant execute on function public.is_rivox_active_staff() to authenticated;

create table if not exists public.admin_pricing_plans (
  id uuid primary key default gen_random_uuid(),
  plan_key text not null unique check (plan_key in ('free','pro','business')),
  name text not null,
  currency text not null default 'USD',
  monthly_price numeric(12,2) not null default 0,
  yearly_price numeric(12,2) not null default 0,
  invoice_limit integer,
  client_limit integer,
  team_limit integer,
  features jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  popular boolean not null default false,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

insert into public.admin_pricing_plans (plan_key,name,currency,monthly_price,yearly_price,invoice_limit,client_limit,team_limit,popular,sort_order)
values
  ('free','Free','USD',0,0,3,10,0,false,1),
  ('pro','Pro','USD',150,1200,500,500,3,true,2),
  ('business','Business','USD',250,2000,null,null,null,false,3)
on conflict (plan_key) do nothing;

create table if not exists public.admin_promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  discount_type text not null check (discount_type in ('percentage','fixed')),
  discount_value numeric(12,2) not null check (discount_value > 0),
  applies_to text[] not null default array['pro','business'],
  billing_scope text not null default 'all' check (billing_scope in ('monthly','yearly','all')),
  starts_at timestamptz,
  expires_at timestamptz,
  usage_limit integer,
  usage_count integer not null default 0,
  active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.communication_channels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  kind text not null default 'team' check (kind in ('team','support','finance','announcement')),
  archived boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

insert into public.communication_channels (name, description, kind)
values
  ('general','Company-wide updates and daily coordination.','team'),
  ('support-desk','Customer issues, escalations and resolution notes.','support'),
  ('finance-ops','Revenue, settlement and subscription coordination.','finance'),
  ('announcements','Owner and admin announcements.','announcement')
on conflict (name) do nothing;

create table if not exists public.communication_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.communication_channels(id) on delete cascade,
  sender_user_id uuid not null default auth.uid(),
  sender_name text not null,
  sender_role text not null,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index if not exists communication_messages_channel_created_idx on public.communication_messages(channel_id, created_at);

alter table public.admin_pricing_plans enable row level security;
alter table public.admin_promo_codes enable row level security;
alter table public.communication_channels enable row level security;
alter table public.communication_messages enable row level security;

drop policy if exists owner_manage_pricing_plans on public.admin_pricing_plans;
create policy owner_manage_pricing_plans on public.admin_pricing_plans for all to authenticated using (public.is_rivox_owner_admin()) with check (public.is_rivox_owner_admin());

drop policy if exists authenticated_read_active_pricing_plans on public.admin_pricing_plans;
create policy authenticated_read_active_pricing_plans on public.admin_pricing_plans for select to authenticated using (active or public.is_rivox_owner_admin());

drop policy if exists owner_manage_promo_codes on public.admin_promo_codes;
create policy owner_manage_promo_codes on public.admin_promo_codes for all to authenticated using (public.is_rivox_owner_admin()) with check (public.is_rivox_owner_admin());

drop policy if exists authenticated_read_active_promos on public.admin_promo_codes;
create policy authenticated_read_active_promos on public.admin_promo_codes for select to authenticated using (active or public.is_rivox_owner_admin());

drop policy if exists internal_read_channels on public.communication_channels;
create policy internal_read_channels on public.communication_channels for select to authenticated using (public.is_rivox_owner_admin() or public.is_rivox_active_staff());

drop policy if exists owner_manage_channels on public.communication_channels;
create policy owner_manage_channels on public.communication_channels for all to authenticated using (public.is_rivox_owner_admin()) with check (public.is_rivox_owner_admin());

drop policy if exists internal_read_messages on public.communication_messages;
create policy internal_read_messages on public.communication_messages for select to authenticated using (public.is_rivox_owner_admin() or public.is_rivox_active_staff());

drop policy if exists internal_send_messages on public.communication_messages;
create policy internal_send_messages on public.communication_messages for insert to authenticated with check ((public.is_rivox_owner_admin() or public.is_rivox_active_staff()) and sender_user_id = auth.uid());

alter publication supabase_realtime add table public.communication_messages;
