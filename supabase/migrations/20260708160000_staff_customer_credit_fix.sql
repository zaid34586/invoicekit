-- Staff/customer separation + real credits/free Pro expiry support.
-- Safe to run multiple times.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ban_reason text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banned_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS credits integer NOT NULL DEFAULT 0 CHECK (credits >= 0);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS free_pro_until timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS admin_notes text;

-- Remove accidental customer profiles that were created when staff logged in
-- through the shared AuthContext profile bootstrap. This keeps Admin → Users
-- clean. Their Supabase Auth account and admin_team_members row remain intact.
DELETE FROM profiles p
USING admin_team_members m
WHERE lower(coalesce(p.email, '')) = lower(coalesce(m.email, ''))
  AND lower(coalesce(p.email, '')) <> 'mz7123272@gmail.com';

DELETE FROM profiles p
USING admin_team_members m
WHERE p.user_id = m.auth_user_id
  AND p.user_id IS NOT NULL
  AND p.user_id <> '00000000-0000-0000-0000-000000000000'::uuid;

CREATE INDEX IF NOT EXISTS idx_profiles_email_lower ON profiles (lower(email));
CREATE INDEX IF NOT EXISTS idx_admin_team_members_email_lower ON admin_team_members (lower(email));
CREATE INDEX IF NOT EXISTS idx_admin_team_members_auth_user_id ON admin_team_members (auth_user_id);
