-- InvoiceKit Admin v2 operations schema.
-- Safe to run multiple times. Creates admin backend tables first, then RLS policies.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ban_reason text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banned_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS credits integer NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS free_pro_until timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS admin_notes text;

CREATE TABLE IF NOT EXISTS admin_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text NOT NULL UNIQUE,
  name text,
  role text NOT NULL DEFAULT 'limited' CHECK (role IN ('full_access','limited','support','finance','viewer')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  temporary_password text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  assigned_to uuid REFERENCES admin_team_members(id) ON DELETE SET NULL,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','done','blocked')),
  due_date date,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_finance_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL DEFAULT current_date,
  type text NOT NULL CHECK (type IN ('income','expense','receivable')),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('subscription','ads','manual','invoice','other')),
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'INR',
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','pending','spent')),
  title text NOT NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  subject text NOT NULL,
  message text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending','resolved','closed')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  assigned_to uuid REFERENCES admin_team_members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text,
  target_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_finance_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- Drop old/mismatched policies after tables exist.
DROP POLICY IF EXISTS "admin_read_all_profiles" ON profiles;
DROP POLICY IF EXISTS "admin_update_profiles" ON profiles;
DROP POLICY IF EXISTS "admin_read_all_invoices" ON invoices;
DROP POLICY IF EXISTS "admin_read_all_clients" ON clients;
DROP POLICY IF EXISTS "admin_read_all_team_members" ON admin_team_members;
DROP POLICY IF EXISTS "admin_manage_team_members" ON admin_team_members;
DROP POLICY IF EXISTS "admin_read_all_tasks" ON admin_tasks;
DROP POLICY IF EXISTS "admin_manage_tasks" ON admin_tasks;
DROP POLICY IF EXISTS "admin_read_all_finance_entries" ON admin_finance_entries;
DROP POLICY IF EXISTS "admin_manage_finance_entries" ON admin_finance_entries;
DROP POLICY IF EXISTS "admin_read_all_support_tickets" ON admin_support_tickets;
DROP POLICY IF EXISTS "admin_manage_support_tickets" ON admin_support_tickets;
DROP POLICY IF EXISTS "admin_read_all_audit_logs" ON admin_audit_logs;
DROP POLICY IF EXISTS "admin_manage_audit_logs" ON admin_audit_logs;

-- Owner admin policies. Email must match src/lib/constants.ts ADMIN_EMAIL.
CREATE POLICY "admin_read_all_profiles" ON profiles FOR SELECT
  TO authenticated USING (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');
CREATE POLICY "admin_update_profiles" ON profiles FOR UPDATE
  TO authenticated USING (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com')
  WITH CHECK (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');

CREATE POLICY "admin_read_all_invoices" ON invoices FOR SELECT
  TO authenticated USING (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');

CREATE POLICY "admin_read_all_clients" ON clients FOR SELECT
  TO authenticated USING (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');

CREATE POLICY "admin_read_all_team_members" ON admin_team_members FOR SELECT
  TO authenticated USING (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');
CREATE POLICY "admin_manage_team_members" ON admin_team_members FOR ALL
  TO authenticated USING (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com')
  WITH CHECK (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');

CREATE POLICY "admin_read_all_tasks" ON admin_tasks FOR SELECT
  TO authenticated USING (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');
CREATE POLICY "admin_manage_tasks" ON admin_tasks FOR ALL
  TO authenticated USING (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com')
  WITH CHECK (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');

CREATE POLICY "admin_read_all_finance_entries" ON admin_finance_entries FOR SELECT
  TO authenticated USING (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');
CREATE POLICY "admin_manage_finance_entries" ON admin_finance_entries FOR ALL
  TO authenticated USING (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com')
  WITH CHECK (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');

CREATE POLICY "admin_read_all_support_tickets" ON admin_support_tickets FOR SELECT
  TO authenticated USING (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');
CREATE POLICY "admin_manage_support_tickets" ON admin_support_tickets FOR ALL
  TO authenticated USING (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com')
  WITH CHECK (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');

CREATE POLICY "admin_read_all_audit_logs" ON admin_audit_logs FOR SELECT
  TO authenticated USING (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');
CREATE POLICY "admin_manage_audit_logs" ON admin_audit_logs FOR ALL
  TO authenticated USING (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com')
  WITH CHECK (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');

CREATE INDEX IF NOT EXISTS idx_admin_tasks_status ON admin_tasks(status);
CREATE INDEX IF NOT EXISTS idx_admin_tasks_assigned_to ON admin_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_admin_finance_entry_date ON admin_finance_entries(entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_admin_support_status ON admin_support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created_at ON admin_audit_logs(created_at DESC);
