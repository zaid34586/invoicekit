-- Rivox invoice automation engine.
-- Safe to run manually in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  event_type text NOT NULL CHECK (event_type IN ('due_reminder','overdue_reminder','payment_thank_you')),
  enabled boolean NOT NULL DEFAULT true,
  offset_days integer NOT NULL DEFAULT 0,
  subject_template text NOT NULL,
  body_template text NOT NULL,
  send_email boolean NOT NULL DEFAULT true,
  create_admin_notification boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid REFERENCES automation_rules(id) ON DELETE SET NULL,
  rule_key text NOT NULL,
  invoice_id uuid,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_email text,
  status text NOT NULL CHECK (status IN ('sent','skipped','failed','simulated')),
  scheduled_for date,
  provider_message_id text,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS automation_runs_dedupe
  ON automation_runs(rule_key, invoice_id, scheduled_for)
  WHERE invoice_id IS NOT NULL AND scheduled_for IS NOT NULL AND status IN ('sent','simulated');
CREATE INDEX IF NOT EXISTS automation_runs_created_idx ON automation_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS automation_runs_status_idx ON automation_runs(status, created_at DESC);

ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS owner_manage_automation_rules ON automation_rules;
CREATE POLICY owner_manage_automation_rules ON automation_rules FOR ALL TO authenticated
  USING (lower(auth.jwt() ->> 'email') = lower(COALESCE(current_setting('app.settings.owner_email', true), 'mz7123272@gmail.com')))
  WITH CHECK (lower(auth.jwt() ->> 'email') = lower(COALESCE(current_setting('app.settings.owner_email', true), 'mz7123272@gmail.com')));

DROP POLICY IF EXISTS owner_read_automation_runs ON automation_runs;
CREATE POLICY owner_read_automation_runs ON automation_runs FOR SELECT TO authenticated
  USING (lower(auth.jwt() ->> 'email') = lower(COALESCE(current_setting('app.settings.owner_email', true), 'mz7123272@gmail.com')));

INSERT INTO automation_rules (key, name, description, event_type, enabled, offset_days, subject_template, body_template)
VALUES
  ('invoice_due_3_days', 'Invoice due reminder', 'Email clients three days before an invoice is due.', 'due_reminder', true, 3,
   'Payment reminder: invoice {{invoice_number}} is due soon',
   'Hi {{client_name}},\n\nThis is a friendly reminder that invoice {{invoice_number}} for {{amount}} is due on {{due_date}}.\n\nThank you,\n{{business_name}}'),
  ('invoice_overdue_daily', 'Overdue invoice reminder', 'Email clients when an unpaid invoice becomes overdue.', 'overdue_reminder', true, 0,
   'Overdue invoice {{invoice_number}}',
   'Hi {{client_name}},\n\nInvoice {{invoice_number}} for {{amount}} became overdue on {{due_date}}. Please arrange payment at your earliest convenience.\n\nThank you,\n{{business_name}}'),
  ('payment_thank_you', 'Payment thank-you', 'Reserved for payment-success webhooks. Disabled until the payment event is connected.', 'payment_thank_you', false, 0,
   'Payment received for invoice {{invoice_number}}',
   'Hi {{client_name}},\n\nThank you. We received payment of {{amount}} for invoice {{invoice_number}}.\n\nRegards,\n{{business_name}}')
ON CONFLICT (key) DO NOTHING;
