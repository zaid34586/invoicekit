create extension if not exists pgcrypto;

create table if not exists public.email_provider_settings (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'resend',
  from_name text not null default 'Rivox',
  from_email text not null default 'onboarding@resend.dev',
  reply_to text,
  email_enabled boolean not null default true,
  welcome_enabled boolean not null default true,
  invoice_enabled boolean not null default true,
  payment_enabled boolean not null default true,
  reminder_enabled boolean not null default true,
  subscription_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  name text not null,
  subject text not null,
  html_body text not null,
  text_body text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  template_key text,
  recipient_email text not null,
  subject text not null,
  status text not null default 'queued' check (status in ('queued','sent','failed','skipped')),
  provider_message_id text,
  error_message text,
  triggered_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into public.email_provider_settings (provider, from_name, from_email)
select 'resend', 'Rivox', 'onboarding@resend.dev'
where not exists (select 1 from public.email_provider_settings);

insert into public.email_templates (template_key, name, subject, html_body, text_body) values
('welcome', 'Welcome email', 'Welcome to Rivox, {{customer_name}}', '<h1>Welcome to Rivox</h1><p>Hello {{customer_name}}, your workspace is ready.</p>', 'Welcome to Rivox, {{customer_name}}.'),
('invoice_sent', 'Invoice sent', 'Invoice {{invoice_number}} from {{business_name}}', '<h1>Invoice {{invoice_number}}</h1><p>Hello {{client_name}}, your invoice total is {{invoice_total}}.</p>', 'Invoice {{invoice_number}} total: {{invoice_total}}.'),
('payment_received', 'Payment received', 'Payment received for invoice {{invoice_number}}', '<h1>Payment received</h1><p>We received {{payment_amount}} for invoice {{invoice_number}}.</p>', 'Payment received: {{payment_amount}}.'),
('payment_reminder', 'Payment reminder', 'Reminder: invoice {{invoice_number}} is due', '<h1>Payment reminder</h1><p>Invoice {{invoice_number}} for {{invoice_total}} is due on {{due_date}}.</p>', 'Invoice {{invoice_number}} is due on {{due_date}}.'),
('overdue_reminder', 'Overdue reminder', 'Overdue invoice {{invoice_number}}', '<h1>Invoice overdue</h1><p>Invoice {{invoice_number}} is overdue. Outstanding amount: {{invoice_total}}.</p>', 'Invoice {{invoice_number}} is overdue.'),
('subscription_activated', 'Subscription activated', 'Your Rivox {{plan_name}} subscription is active', '<h1>Subscription active</h1><p>Your {{plan_name}} plan is now active. Next billing date: {{renewal_date}}.</p>', 'Your {{plan_name}} subscription is active.'),
('subscription_cancelled', 'Subscription cancelled', 'Your Rivox subscription has been cancelled', '<h1>Subscription cancelled</h1><p>Your access remains available until {{access_until}}.</p>', 'Your subscription was cancelled.'),
('trial_ending', 'Trial ending', 'Your Rivox trial ends soon', '<h1>Your trial ends soon</h1><p>Your trial ends on {{trial_end_date}}. Choose a plan to continue.</p>', 'Your trial ends on {{trial_end_date}}.')
on conflict (template_key) do nothing;

alter table public.email_provider_settings enable row level security;
alter table public.email_templates enable row level security;
alter table public.email_delivery_logs enable row level security;

drop policy if exists "admin manage email settings" on public.email_provider_settings;
create policy "admin manage email settings" on public.email_provider_settings for all to authenticated
using (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com')
with check (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');

drop policy if exists "admin manage email templates" on public.email_templates;
create policy "admin manage email templates" on public.email_templates for all to authenticated
using (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com')
with check (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');

drop policy if exists "admin read email logs" on public.email_delivery_logs;
create policy "admin read email logs" on public.email_delivery_logs for select to authenticated
using (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');

create index if not exists email_logs_created_idx on public.email_delivery_logs(created_at desc);
create index if not exists email_logs_status_idx on public.email_delivery_logs(status);
