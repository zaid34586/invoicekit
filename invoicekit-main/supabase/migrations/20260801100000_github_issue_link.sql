-- P3: GitHub integration — links a support ticket (typically category='bug')
-- to a GitHub issue in the product's repo, and lets a webhook auto-resolve
-- the ticket when the issue is closed.

ALTER TABLE admin_support_tickets ADD COLUMN IF NOT EXISTS github_issue_number integer;
ALTER TABLE admin_support_tickets ADD COLUMN IF NOT EXISTS github_issue_url text;

CREATE INDEX IF NOT EXISTS idx_support_ticket_github_issue
  ON admin_support_tickets(github_issue_number)
  WHERE github_issue_number IS NOT NULL;
