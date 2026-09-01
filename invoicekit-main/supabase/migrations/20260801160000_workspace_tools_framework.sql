-- Fresh rebuild — Phase 2b: extensible Workspace tools.
--
-- Design doc: "task ko uska workspace mein kaam kar sakte hain chahe
-- WhatsApp ka kaam ho, data nikalna ho, client se meeting ho, email bhejna
-- ho" -- a generic log so any future tool-card (WhatsApp, calendar, CRM,
-- etc.) can plug into the SAME workspace panel and SAME audit trail,
-- without a new table per integration. Real third-party integrations
-- (an actual WhatsApp Business API connection, for example) need credentials
-- this repo doesn't have -- this migration ships the extensible framework +
-- two real, immediately useful tools (quick note logger, contact-channel
-- logger) that prove the pattern.

CREATE TABLE IF NOT EXISTS workspace_tool_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type text NOT NULL CHECK (item_type IN ('task', 'ticket')),
  item_id uuid NOT NULL,
  tool_key text NOT NULL,            -- e.g. 'note', 'contact_log', 'whatsapp' (future), 'email' (future)
  summary text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  performed_by uuid REFERENCES admin_team_members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_tool_logs_item ON workspace_tool_logs(item_type, item_id, created_at DESC);

ALTER TABLE workspace_tool_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_read_tool_logs_for_own_items" ON workspace_tool_logs;
CREATE POLICY "staff_read_tool_logs_for_own_items" ON workspace_tool_logs FOR SELECT
TO authenticated
USING (
  lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com'
  OR EXISTS (
    SELECT 1 FROM admin_team_members m
    WHERE m.status = 'active' AND (m.auth_user_id = auth.uid() OR lower(m.email) = lower(auth.jwt() ->> 'email'))
      AND (
        (workspace_tool_logs.item_type = 'task' AND EXISTS (SELECT 1 FROM admin_tasks t WHERE t.id = workspace_tool_logs.item_id AND t.assigned_to = m.id))
        OR (workspace_tool_logs.item_type = 'ticket' AND EXISTS (SELECT 1 FROM admin_support_tickets s WHERE s.id = workspace_tool_logs.item_id AND s.assigned_to = m.id))
      )
  )
);

DROP POLICY IF EXISTS "staff_add_tool_logs_for_own_items" ON workspace_tool_logs;
CREATE POLICY "staff_add_tool_logs_for_own_items" ON workspace_tool_logs FOR INSERT
TO authenticated
WITH CHECK (
  lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com'
  OR EXISTS (
    SELECT 1 FROM admin_team_members m
    WHERE m.status = 'active' AND (m.auth_user_id = auth.uid() OR lower(m.email) = lower(auth.jwt() ->> 'email'))
      AND m.id = performed_by
      AND (
        (item_type = 'task' AND EXISTS (SELECT 1 FROM admin_tasks t WHERE t.id = item_id AND t.assigned_to = m.id))
        OR (item_type = 'ticket' AND EXISTS (SELECT 1 FROM admin_support_tickets s WHERE s.id = item_id AND s.assigned_to = m.id))
      )
  )
);
