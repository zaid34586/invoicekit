-- Prevent duplicate clients for the same user by normalized name, email, or phone.
-- Existing duplicate data is never deleted. Each unique index is only created
-- when its corresponding existing values are already clean.

-- Normalize whitespace/case for future email comparisons.
UPDATE public.clients
SET email = lower(btrim(email))
WHERE email IS NOT NULL
  AND email <> lower(btrim(email));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.clients
    WHERE name IS NOT NULL AND btrim(name) <> ''
    GROUP BY user_id, lower(btrim(name))
    HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS clients_user_name_unique_idx
      ON public.clients (user_id, lower(btrim(name)))
      WHERE name IS NOT NULL AND btrim(name) <> '';
  ELSE
    RAISE NOTICE 'Duplicate client names exist; name unique index skipped until duplicates are cleaned.';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.clients
    WHERE email IS NOT NULL AND btrim(email) <> ''
    GROUP BY user_id, lower(btrim(email))
    HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS clients_user_email_unique_idx
      ON public.clients (user_id, lower(btrim(email)))
      WHERE email IS NOT NULL AND btrim(email) <> '';
  ELSE
    RAISE NOTICE 'Duplicate client emails exist; email unique index skipped until duplicates are cleaned.';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.clients
    WHERE phone IS NOT NULL AND regexp_replace(phone, '\\D', '', 'g') <> ''
    GROUP BY user_id,
      regexp_replace(coalesce(country_code, ''), '\\D', '', 'g') ||
      regexp_replace(phone, '\\D', '', 'g')
    HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS clients_user_phone_unique_idx
      ON public.clients (
        user_id,
        (regexp_replace(coalesce(country_code, ''), '\\D', '', 'g') ||
         regexp_replace(phone, '\\D', '', 'g'))
      )
      WHERE phone IS NOT NULL AND regexp_replace(phone, '\\D', '', 'g') <> '';
  ELSE
    RAISE NOTICE 'Duplicate client phone numbers exist; phone unique index skipped until duplicates are cleaned.';
  END IF;
END $$;
