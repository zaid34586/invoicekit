-- Rivox owner workspace and security settings.
-- Safe to run independently in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.admin_workspace_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_name text NOT NULL DEFAULT 'Rivox',
  support_email text NOT NULL DEFAULT 'support@getrivox.com',
  default_currency text NOT NULL DEFAULT 'USD',
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  language text NOT NULL DEFAULT 'English',
  date_format text NOT NULL DEFAULT 'DD/MM/YYYY',
  require_strong_passwords boolean NOT NULL DEFAULT true,
  session_timeout_minutes integer NOT NULL DEFAULT 60 CHECK (session_timeout_minutes BETWEEN 15 AND 10080),
  notify_on_new_login boolean NOT NULL DEFAULT true,
  notify_on_role_change boolean NOT NULL DEFAULT true,
  notify_on_security_event boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_workspace_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_read_workspace_settings" ON public.admin_workspace_settings;
DROP POLICY IF EXISTS "owner_manage_workspace_settings" ON public.admin_workspace_settings;

CREATE POLICY "owner_read_workspace_settings"
ON public.admin_workspace_settings FOR SELECT
TO authenticated
USING (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');

CREATE POLICY "owner_manage_workspace_settings"
ON public.admin_workspace_settings FOR ALL
TO authenticated
USING (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com')
WITH CHECK (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');

CREATE UNIQUE INDEX IF NOT EXISTS admin_workspace_settings_singleton
ON public.admin_workspace_settings ((true));

INSERT INTO public.admin_workspace_settings (
  workspace_name,
  support_email,
  default_currency,
  timezone,
  language,
  date_format
)
SELECT 'Rivox', 'support@getrivox.com', 'USD', 'Asia/Kolkata', 'English', 'DD/MM/YYYY'
WHERE NOT EXISTS (SELECT 1 FROM public.admin_workspace_settings);
