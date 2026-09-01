-- Rivox Automated Production QA & Release Center

create table if not exists public.admin_qa_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('running','passed','warning','failed')),
  score integer not null default 0 check (score between 0 and 100),
  passed_checks integer not null default 0,
  total_checks integer not null default 0,
  trigger_source text not null default 'manual' check (trigger_source in ('manual','deployment','scheduled')),
  release_version text,
  duration_ms integer,
  summary text,
  created_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_qa_check_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.admin_qa_runs(id) on delete cascade,
  area text not null,
  check_name text not null,
  status text not null check (status in ('pass','warning','fail')),
  latency_ms integer,
  detail text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_qa_runs_created on public.admin_qa_runs(created_at desc);
create index if not exists idx_admin_qa_results_run on public.admin_qa_check_results(run_id,status);

alter table public.admin_qa_runs enable row level security;
alter table public.admin_qa_check_results enable row level security;

create policy "owner_manage_qa_runs" on public.admin_qa_runs for all to authenticated
using (lower(auth.jwt()->>'email')='mz7123272@gmail.com')
with check (lower(auth.jwt()->>'email')='mz7123272@gmail.com');
create policy "owner_manage_qa_results" on public.admin_qa_check_results for all to authenticated
using (lower(auth.jwt()->>'email')='mz7123272@gmail.com')
with check (lower(auth.jwt()->>'email')='mz7123272@gmail.com');

grant select on public.admin_qa_runs,public.admin_qa_check_results to authenticated;
grant all on public.admin_qa_runs,public.admin_qa_check_results to service_role;

