-- Public pricing pages need read-only access to currently enabled marketing offers.
-- Date validity is also checked in the frontend; only non-sensitive offer fields are selected.
drop policy if exists public_read_active_promos on public.admin_promo_codes;
create policy public_read_active_promos
on public.admin_promo_codes
for select
to anon
using (
  active = true
  and (starts_at is null or starts_at <= now())
  and (expires_at is null or expires_at >= now())
);
