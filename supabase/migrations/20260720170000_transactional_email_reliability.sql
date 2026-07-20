-- Reliable transactional email state for invoice receipts and workspace invites.

alter table public.invoice_payments
  add column if not exists receipt_email text,
  add column if not exists receipt_email_status text not null default 'pending',
  add column if not exists receipt_email_sent_at timestamptz,
  add column if not exists receipt_email_error text;

do $$ begin
  alter table public.invoice_payments
    add constraint invoice_payments_receipt_email_status_check
    check (receipt_email_status in ('pending','sent','failed','skipped'));
exception when duplicate_object then null;
end $$;

alter table public.workspace_invitations
  add column if not exists email_status text not null default 'pending',
  add column if not exists email_sent_at timestamptz,
  add column if not exists email_provider_id text,
  add column if not exists email_error text,
  add column if not exists last_email_attempt_at timestamptz;

do $$ begin
  alter table public.workspace_invitations
    add constraint workspace_invitations_email_status_check
    check (email_status in ('pending','sent','failed'));
exception when duplicate_object then null;
end $$;

insert into public.email_templates (template_key, name, subject, html_body, text_body) values
('team_invitation', 'Workspace invitation', 'Your Rivox login for {{workspace_name}}', '<h1>Welcome to Rivox</h1><p>You have been invited to {{workspace_name}}.</p>', 'You have been invited to {{workspace_name}}.'),
('invoice_payment_receipt', 'Invoice payment receipt', 'Receipt for invoice {{invoice_number}}', '<h1>Payment receipt</h1><p>Your payment for invoice {{invoice_number}} was successful.</p>', 'Payment received for invoice {{invoice_number}}.')
on conflict (template_key) do nothing;

create index if not exists invoice_payments_receipt_status_idx
  on public.invoice_payments(receipt_email_status, paid_at desc);

