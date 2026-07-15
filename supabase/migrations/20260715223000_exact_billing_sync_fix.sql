-- Exact Rivox billing sync repair. Safe with an empty subscriptions table.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS provider_environment text NOT NULL DEFAULT 'production';

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_user_id_key;

DROP INDEX IF EXISTS public.subscriptions_user_id_uidx;
DROP INDEX IF EXISTS public.subscriptions_user_environment_uidx;

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_user_provider_environment_key;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_user_provider_environment_key
  UNIQUE (user_id, provider_environment);

ALTER TABLE public.billing_events
  ADD COLUMN IF NOT EXISTS provider_environment text NOT NULL DEFAULT 'production';

CREATE INDEX IF NOT EXISTS billing_events_user_environment_created_idx
  ON public.billing_events(user_id, provider_environment, created_at DESC);