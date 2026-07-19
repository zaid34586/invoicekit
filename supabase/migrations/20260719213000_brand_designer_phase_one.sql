alter table public.workspace_branding
  add column if not exists block_order jsonb not null default '["header","client","items","totals","payment","terms","approval","footer"]'::jsonb,
  add column if not exists hidden_blocks jsonb not null default '[]'::jsonb,
  add column if not exists design_name text not null default 'Primary brand';

create table if not exists public.workspace_brand_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  snapshot jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.workspace_brand_versions enable row level security;
drop policy if exists "brand versions owner read" on public.workspace_brand_versions;
create policy "brand versions owner read" on public.workspace_brand_versions
for select to authenticated using(public.is_workspace_owner(workspace_id));
drop policy if exists "brand versions owner write" on public.workspace_brand_versions;
create policy "brand versions owner write" on public.workspace_brand_versions
for all to authenticated using(public.is_workspace_owner(workspace_id))
with check(public.is_workspace_owner(workspace_id));

create index if not exists workspace_brand_versions_workspace_created_idx
on public.workspace_brand_versions(workspace_id,created_at desc);
