-- Rivox Priority Support: plan-based priority, screenshot attachments and secure storage.

ALTER TABLE public.admin_support_tickets
  ADD COLUMN IF NOT EXISTS plan_at_creation text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

CREATE TABLE IF NOT EXISTS public.support_ticket_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.admin_support_tickets(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.support_ticket_messages(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  mime_type text NOT NULL CHECK (mime_type IN ('image/png','image/jpeg','image/webp')),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_attachments_ticket ON public.support_ticket_attachments(ticket_id, created_at);
ALTER TABLE public.support_ticket_attachments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.support_priority_for_user(p_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT CASE lower(coalesce((SELECT plan FROM public.profiles WHERE user_id=p_user_id OR id=p_user_id LIMIT 1),'free'))
    WHEN 'business' THEN 'urgent'
    WHEN 'pro' THEN 'high'
    ELSE 'medium'
  END;
$$;

CREATE OR REPLACE FUNCTION public.apply_support_plan_priority()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_plan text;
BEGIN
  SELECT lower(coalesce(plan,'free')) INTO v_plan FROM public.profiles WHERE user_id=NEW.user_id OR id=NEW.user_id LIMIT 1;
  v_plan := coalesce(v_plan,'free');
  NEW.plan_at_creation := v_plan;
  NEW.priority := CASE WHEN v_plan='business' THEN 'urgent' WHEN v_plan='pro' THEN 'high' ELSE 'medium' END;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_apply_support_plan_priority ON public.admin_support_tickets;
CREATE TRIGGER trg_apply_support_plan_priority BEFORE INSERT ON public.admin_support_tickets FOR EACH ROW EXECUTE FUNCTION public.apply_support_plan_priority();

DROP POLICY IF EXISTS "customers_read_own_support_attachments" ON public.support_ticket_attachments;
CREATE POLICY "customers_read_own_support_attachments" ON public.support_ticket_attachments FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.admin_support_tickets t WHERE t.id=ticket_id AND t.user_id=auth.uid()));
DROP POLICY IF EXISTS "customers_add_own_support_attachments" ON public.support_ticket_attachments;
CREATE POLICY "customers_add_own_support_attachments" ON public.support_ticket_attachments FOR INSERT TO authenticated
WITH CHECK (uploaded_by=auth.uid() AND EXISTS (SELECT 1 FROM public.admin_support_tickets t WHERE t.id=ticket_id AND t.user_id=auth.uid() AND t.status <> 'closed'));
DROP POLICY IF EXISTS "owner_manage_support_attachments" ON public.support_ticket_attachments;
CREATE POLICY "owner_manage_support_attachments" ON public.support_ticket_attachments FOR ALL TO authenticated
USING (lower(auth.jwt()->>'email')='mz7123272@gmail.com') WITH CHECK (lower(auth.jwt()->>'email')='mz7123272@gmail.com');

INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('support-attachments','support-attachments',false,5242880,ARRAY['image/png','image/jpeg','image/webp'])
ON CONFLICT (id) DO UPDATE SET public=false,file_size_limit=5242880,allowed_mime_types=EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "support users upload own files" ON storage.objects;
CREATE POLICY "support users upload own files" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id='support-attachments' AND (storage.foldername(name))[1]=auth.uid()::text);
DROP POLICY IF EXISTS "support users read own files" ON storage.objects;
CREATE POLICY "support users read own files" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id='support-attachments' AND ((storage.foldername(name))[1]=auth.uid()::text OR lower(auth.jwt()->>'email')='mz7123272@gmail.com'));
