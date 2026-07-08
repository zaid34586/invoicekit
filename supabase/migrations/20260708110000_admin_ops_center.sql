-- InvoiceKit Admin Operations Center Phase 5
-- Safe to run multiple times. Adds production task/support fields.

ALTER TABLE admin_tasks ADD COLUMN IF NOT EXISTS department text NOT NULL DEFAULT 'general'
  CHECK (department IN ('general','support','finance','sales','engineering'));
ALTER TABLE admin_tasks ADD COLUMN IF NOT EXISTS progress integer NOT NULL DEFAULT 0
  CHECK (progress >= 0 AND progress <= 100);
ALTER TABLE admin_tasks ADD COLUMN IF NOT EXISTS internal_notes text;

ALTER TABLE admin_support_tickets ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES admin_team_members(id) ON DELETE SET NULL;
ALTER TABLE admin_support_tickets ADD COLUMN IF NOT EXISTS internal_notes text;

CREATE INDEX IF NOT EXISTS idx_admin_tasks_department ON admin_tasks(department);
CREATE INDEX IF NOT EXISTS idx_admin_tasks_priority ON admin_tasks(priority);
CREATE INDEX IF NOT EXISTS idx_admin_support_assigned_to ON admin_support_tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_admin_support_priority ON admin_support_tickets(priority);
