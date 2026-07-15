-- Final Rivox billing identity and Paddle sync repair.

-- Keep the public profile linked to the current auth user by email.
UPDATE public.profiles p
SET user_id = u.id
FROM auth.users u
WHERE lower(p.email) = lower(u.email)
  AND p.user_id IS DISTINCT FROM u.id;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_user_id_unique_idx
  ON public.profiles(user_id)
  WHERE user_id IS NOT NULL;

-- One Paddle subscription per user and Paddle environment.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS provider_environment text NOT NULL DEFAULT 'production';

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_user_id_key;

DROP INDEX IF EXISTS subscriptions_user_id_key;
DROP INDEX IF EXISTS subscriptions_user_environment_uidx;

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_user_provider_environment_key;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_user_provider_environment_key
  UNIQUE (user_id, provider_environment);

ALTER TABLE public.billing_events
  ADD COLUMN IF NOT EXISTS provider_environment text NOT NULL DEFAULT 'production';

CREATE INDEX IF NOT EXISTS billing_events_user_environment_created_idx
  ON public.billing_events(user_id, provider_environment, created_at DESC);
