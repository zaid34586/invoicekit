-- Intern sales tracking via promo codes
-- Adds intern attribution fields to admin_promo_codes

-- Add intern tracking columns to promo codes
ALTER TABLE admin_promo_codes ADD COLUMN IF NOT EXISTS intern_name text;
ALTER TABLE admin_promo_codes ADD COLUMN IF NOT EXISTS intern_id text;
ALTER TABLE admin_promo_codes ADD COLUMN IF NOT EXISTS intern_email text;

-- Add intern attribution to offer redemptions
ALTER TABLE admin_offer_redemptions ADD COLUMN IF NOT EXISTS intern_name text;
ALTER TABLE admin_offer_redemptions ADD COLUMN IF NOT EXISTS intern_code text;
ALTER TABLE admin_offer_redemptions ADD COLUMN IF NOT EXISTS sale_amount numeric(12,2);
ALTER TABLE admin_offer_redemptions ADD COLUMN IF NOT EXISTS plan_type text;
ALTER TABLE admin_offer_redemptions ADD COLUMN IF NOT EXISTS bonus_amount numeric(12,2) DEFAULT 0;

-- Index for quick intern sales lookup
CREATE INDEX IF NOT EXISTS idx_offer_redemptions_intern ON admin_offer_redemptions(intern_code) WHERE intern_code IS NOT NULL;

-- View: intern sales summary
CREATE OR REPLACE VIEW intern_sales_summary AS
SELECT
  r.intern_name,
  r.intern_code,
  COUNT(*) as total_sales,
  COUNT(*) FILTER (WHERE r.plan_type = 'pro') as pro_sales,
  COUNT(*) FILTER (WHERE r.plan_type = 'business') as business_sales,
  COALESCE(SUM(r.sale_amount), 0) as total_revenue,
  COALESCE(SUM(r.bonus_amount), 0) as total_bonus,
  MIN(r.redeemed_at) as first_sale,
  MAX(r.redeemed_at) as last_sale
FROM admin_offer_redemptions r
WHERE r.intern_code IS NOT NULL
GROUP BY r.intern_name, r.intern_code;

-- View: detailed sale log per intern
CREATE OR REPLACE VIEW intern_sale_log AS
SELECT
  r.id,
  r.intern_name,
  r.intern_code,
  r.user_id,
  r.plan_type,
  r.sale_amount,
  r.bonus_amount,
  r.redeemed_at,
  p.full_name as customer_name,
  p.email as customer_email
FROM admin_offer_redemptions r
LEFT JOIN profiles p ON p.user_id = r.user_id OR p.id = r.user_id
WHERE r.intern_code IS NOT NULL
ORDER BY r.redeemed_at DESC;

-- Function to calculate bonus for a sale
CREATE OR REPLACE FUNCTION calculate_intern_bonus(plan_type text)
RETURNS numeric AS $$
BEGIN
  RETURN CASE
    WHEN plan_type = 'pro' THEN 1000
    WHEN plan_type = 'business' THEN 1500
    ELSE 0
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
