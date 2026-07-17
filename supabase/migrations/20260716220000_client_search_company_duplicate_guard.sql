-- Client management hardening: optional company name + duplicate guard support
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS company_name text;

-- Normalize stored emails so the frontend duplicate check is consistent.
UPDATE public.clients
SET email = lower(trim(email))
WHERE email IS NOT NULL AND email <> lower(trim(email));

CREATE INDEX IF NOT EXISTS clients_user_company_name_idx
  ON public.clients (user_id, lower(company_name))
  WHERE company_name IS NOT NULL AND btrim(company_name) <> '';

-- Add a database-level duplicate guard only when current data is already clean.
-- Existing duplicate rows are left untouched so this migration never deletes user data.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.clients
    WHERE email IS NOT NULL AND btrim(email) <> ''
    GROUP BY user_id, lower(email)
    HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS clients_user_email_unique_idx
      ON public.clients (user_id, lower(email))
      WHERE email IS NOT NULL AND btrim(email) <> '';
  ELSE
    RAISE NOTICE 'Duplicate client emails exist; unique index skipped. Clean duplicates, then rerun the index statement.';
  END IF;
END $$;
