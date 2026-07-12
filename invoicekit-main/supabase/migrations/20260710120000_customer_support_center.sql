-- Customer Support Center
-- Adds customer-facing ticket conversations while preserving existing admin/staff workflows.

ALTER TABLE admin_support_tickets ADD COLUMN IF NOT EXISTS ticket_number text;
ALTER TABLE admin_support_tickets ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general';
ALTER TABLE admin_support_tickets ADD COLUMN IF NOT EXISTS last_reply_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_ticket_number_unique
  ON admin_support_tickets(ticket_number)
  WHERE ticket_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_support_user_updated
  ON admin_support_tickets(user_id, updated_at DESC);

CREATE OR REPLACE FUNCTION public.set_support_ticket_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.ticket_number IS NULL OR NEW.ticket_number = '' THEN
    NEW.ticket_number := 'TKT-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(replace(NEW.id::text, '-', ''), 1, 6));
  END IF;
  NEW.updated_at := COALESCE(NEW.updated_at, now());
  NEW.last_reply_at := COALESCE(NEW.last_reply_at, NEW.created_at, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_support_ticket_number ON admin_support_tickets;
CREATE TRIGGER trg_set_support_ticket_number
BEFORE INSERT ON admin_support_tickets
FOR EACH ROW EXECUTE FUNCTION public.set_support_ticket_number();

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES admin_support_tickets(id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_type text NOT NULL CHECK (author_type IN ('customer','staff','admin')),
  message text NOT NULL CHECK (char_length(trim(message)) > 0),
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_created
  ON support_ticket_messages(ticket_id, created_at);

ALTER TABLE support_ticket_messages ENABLE ROW LEVEL SECURITY;

-- Customer ticket policies.
DROP POLICY IF EXISTS "customers_create_own_tickets" ON admin_support_tickets;
DROP POLICY IF EXISTS "customers_read_own_tickets" ON admin_support_tickets;
DROP POLICY IF EXISTS "customers_update_own_open_tickets" ON admin_support_tickets;

CREATE POLICY "customers_create_own_tickets"
ON admin_support_tickets FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "customers_read_own_tickets"
ON admin_support_tickets FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "customers_update_own_open_tickets"
ON admin_support_tickets FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Customer messages: customers can read public messages and add replies to their own tickets.
DROP POLICY IF EXISTS "customers_read_own_ticket_messages" ON support_ticket_messages;
DROP POLICY IF EXISTS "customers_add_own_ticket_messages" ON support_ticket_messages;
CREATE POLICY "customers_read_own_ticket_messages"
ON support_ticket_messages FOR SELECT TO authenticated
USING (
  is_internal = false AND EXISTS (
    SELECT 1 FROM admin_support_tickets t
    WHERE t.id = ticket_id AND t.user_id = auth.uid()
  )
);
CREATE POLICY "customers_add_own_ticket_messages"
ON support_ticket_messages FOR INSERT TO authenticated
WITH CHECK (
  author_user_id = auth.uid()
  AND author_type = 'customer'
  AND is_internal = false
  AND EXISTS (
    SELECT 1 FROM admin_support_tickets t
    WHERE t.id = ticket_id AND t.user_id = auth.uid() AND t.status <> 'closed'
  )
);

-- Owner admin can manage all messages.
DROP POLICY IF EXISTS "owner_manage_support_messages" ON support_ticket_messages;
CREATE POLICY "owner_manage_support_messages"
ON support_ticket_messages FOR ALL TO authenticated
USING (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com')
WITH CHECK (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');

-- Active support/full-access staff can read and reply to tickets.
DROP POLICY IF EXISTS "support_staff_read_tickets" ON admin_support_tickets;
DROP POLICY IF EXISTS "support_staff_update_tickets" ON admin_support_tickets;
CREATE POLICY "support_staff_read_tickets"
ON admin_support_tickets FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM admin_team_members m
  WHERE m.auth_user_id = auth.uid()
    AND m.status = 'active'
    AND m.role IN ('support','full_access')
));
CREATE POLICY "support_staff_update_tickets"
ON admin_support_tickets FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM admin_team_members m
  WHERE m.auth_user_id = auth.uid()
    AND m.status = 'active'
    AND m.role IN ('support','full_access')
))
WITH CHECK (EXISTS (
  SELECT 1 FROM admin_team_members m
  WHERE m.auth_user_id = auth.uid()
    AND m.status = 'active'
    AND m.role IN ('support','full_access')
));

DROP POLICY IF EXISTS "support_staff_read_messages" ON support_ticket_messages;
DROP POLICY IF EXISTS "support_staff_add_messages" ON support_ticket_messages;
CREATE POLICY "support_staff_read_messages"
ON support_ticket_messages FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM admin_team_members m
  WHERE m.auth_user_id = auth.uid()
    AND m.status = 'active'
    AND m.role IN ('support','full_access')
));
CREATE POLICY "support_staff_add_messages"
ON support_ticket_messages FOR INSERT TO authenticated
WITH CHECK (
  author_user_id = auth.uid()
  AND author_type = 'staff'
  AND EXISTS (
    SELECT 1 FROM admin_team_members m
    WHERE m.auth_user_id = auth.uid()
      AND m.status = 'active'
      AND m.role IN ('support','full_access')
  )
);

-- Backfill ticket numbers and seed first customer message from legacy ticket message field.
UPDATE admin_support_tickets
SET ticket_number = 'TKT-' || to_char(created_at, 'YYMMDD') || '-' || upper(substr(replace(id::text, '-', ''), 1, 6)),
    last_reply_at = COALESCE(last_reply_at, created_at)
WHERE ticket_number IS NULL;

INSERT INTO support_ticket_messages (ticket_id, author_user_id, author_type, message, is_internal, created_at)
SELECT t.id, t.user_id, 'customer', t.message, false, t.created_at
FROM admin_support_tickets t
WHERE t.user_id IS NOT NULL
  AND NULLIF(trim(t.message), '') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM support_ticket_messages m WHERE m.ticket_id = t.id);
