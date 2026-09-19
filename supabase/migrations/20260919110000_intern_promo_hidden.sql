-- Add is_intern flag to promo codes
-- Intern codes won't show on public landing/pricing pages
-- They only work when customer manually enters the code at checkout

ALTER TABLE admin_promo_codes ADD COLUMN IF NOT EXISTS is_intern boolean NOT NULL DEFAULT false;

-- Update existing intern codes (codes that have intern_name set)
UPDATE admin_promo_codes SET is_intern = true WHERE intern_name IS NOT NULL AND intern_name != '';
