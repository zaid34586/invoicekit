-- Lemon Squeezy subscription billing for InvoiceKit.
-- Safe to run repeatedly.

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'lemon_squeezy';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS provider_subscription_id text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS provider_customer_id text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS provider_order_id text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS product_id text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS variant_id text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS billing_cycle text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'inactive';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS customer_email text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS amount numeric;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS renews_at timestamptz;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS ends_at timestamptz;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cancelled boolean NOT NULL DEFAULT false;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_provider_subscription_uidx
  ON subscriptions(provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON subscriptions(status);

CREATE TABLE IF NOT EXISTS billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_event_id text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'lemon_squeezy',
  event_name text NOT NULL,
  order_id text,
  subscription_id text,
  plan text,
  billing_cycle text,
  amount numeric NOT NULL DEFAULT 0,
  currency text,
  status text,
  receipt_url text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_events_user_created_idx ON billing_events(user_id, created_at DESC);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_subscription" ON subscriptions;
CREATE POLICY "users_read_own_subscription" ON subscriptions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_read_own_billing_events" ON billing_events;
CREATE POLICY "users_read_own_billing_events" ON billing_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "owner_admin_reads_subscriptions" ON subscriptions;
CREATE POLICY "owner_admin_reads_subscriptions" ON subscriptions
  FOR SELECT TO authenticated
  USING (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');

DROP POLICY IF EXISTS "owner_admin_reads_billing_events" ON billing_events;
CREATE POLICY "owner_admin_reads_billing_events" ON billing_events
  FOR SELECT TO authenticated
  USING (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');
