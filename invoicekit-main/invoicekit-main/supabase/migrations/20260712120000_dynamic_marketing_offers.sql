-- Dynamic, admin-managed marketing offers shown on public pricing pages.
alter table public.admin_promo_codes
  add column if not exists description text,
  add column if not exists badge_text text,
  add column if not exists featured boolean not null default false,
  add column if not exists priority integer not null default 0,
  add column if not exists paddle_discount_id text,
  add column if not exists paddle_synced boolean not null default false;

create index if not exists admin_promo_codes_public_active_idx
  on public.admin_promo_codes(active, starts_at, expires_at, featured, priority);

-- Public visitors need to read only currently valid offers. Sensitive management remains owner-only.
drop policy if exists public_read_current_promos on public.admin_promo_codes;
create policy public_read_current_promos
on public.admin_promo_codes
for select
to anon
using (
  active = true
  and (starts_at is null or starts_at <= now())
  and (expires_at is null or expires_at >= now())
  and (usage_limit is null or usage_count < usage_limit)
);
