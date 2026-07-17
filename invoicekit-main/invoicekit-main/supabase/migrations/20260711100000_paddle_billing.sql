-- Paddle Billing support for Rivox.
-- Stores only an encrypted backend API key plus non-secret health metadata.

create table if not exists public.admin_paddle_credentials (
  id text primary key default 'primary' check (id = 'primary'),
  encrypted_key text,
  encryption_iv text,
  last_four text,
  expires_at timestamptz,
  connection_status text not null default 'not_configured' check (connection_status in ('connected','not_configured','error')),
  last_tested_at timestamptz,
  last_error text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

insert into public.admin_paddle_credentials (id)
values ('primary')
on conflict (id) do nothing;

alter table public.admin_paddle_credentials enable row level security;

drop policy if exists owner_read_paddle_credentials on public.admin_paddle_credentials;
create policy owner_read_paddle_credentials
on public.admin_paddle_credentials
for select to authenticated
using (public.is_rivox_owner_admin());

-- Writes are intentionally service-role only through the owner-protected Edge Function.
revoke insert, update, delete on public.admin_paddle_credentials from authenticated;

grant select on public.admin_paddle_credentials to authenticated;

alter table public.subscriptions alter column provider set default 'paddle';
