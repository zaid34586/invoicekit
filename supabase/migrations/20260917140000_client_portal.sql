-- Client Portal: Add portal_token to clients table

-- Add portal_token column
ALTER TABLE clients ADD COLUMN IF NOT EXISTS portal_token text UNIQUE;

-- Generate unique tokens for existing clients
UPDATE clients 
SET portal_token = gen_random_uuid()::text 
WHERE portal_token IS NULL;

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_clients_portal_token ON clients(portal_token) WHERE portal_token IS NOT NULL;

-- Add RLS policy for portal access (public read by portal_token)
DROP POLICY IF EXISTS "client_portal_public_access" ON clients;
CREATE POLICY "client_portal_public_access" ON clients
  FOR SELECT
  USING (portal_token IS NOT NULL);

-- Enable RLS on clients if not already enabled
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- Allow public read access to invoices via share_token (already exists)
-- Ensure the portal can read invoice items too
COMMENT ON COLUMN clients.portal_token IS 'Unique token for client portal access. Clients use this to log in to their portal.';
