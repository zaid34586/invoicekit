-- Ensures the international business-profile columns exist.
-- Safe to run even if some/all already exist (IF NOT EXISTS on every column).
-- This does not alter or drop anything existing.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS country_code text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS timezone text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS date_format text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS currency text;
