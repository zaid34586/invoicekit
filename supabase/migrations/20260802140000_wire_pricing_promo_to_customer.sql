-- Critical fix: Admin's "Plans & Pricing" / "Growth Center" pricing and
-- promo code editors wrote to admin_pricing_plans / admin_promo_codes, but
-- the customer-facing Billing page sourced its prices from a hardcoded
-- static file (src/lib/pricing.ts) that never read either table. Every
-- price change and every promo code was silently a no-op for customers.
--
-- admin_pricing_plans also only supported ONE currency per plan (unique on
-- plan_key alone), but the actual pricing model is region-based (India INR
-- vs rest-of-world USD, per src/lib/pricing.ts's INDIA_PLANS/GLOBAL_PLANS).
-- This adds a region column so both currencies are independently editable,
-- seeded with the exact values the static file already used (so nothing
-- changes for customers today -- this just makes those numbers live-editable
-- going forward).

ALTER TABLE admin_pricing_plans ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'global' CHECK (region IN ('global', 'india'));

ALTER TABLE admin_pricing_plans DROP CONSTRAINT IF EXISTS admin_pricing_plans_plan_key_key;
ALTER TABLE admin_pricing_plans DROP CONSTRAINT IF EXISTS admin_pricing_plans_plan_key_region_key;
ALTER TABLE admin_pricing_plans ADD CONSTRAINT admin_pricing_plans_plan_key_region_key UNIQUE (plan_key, region);

-- Existing rows (seeded as USD) are explicitly the "global" region rows.
UPDATE admin_pricing_plans SET region = 'global' WHERE region IS NULL OR region = 'global';

-- Seed the India (INR) rows with the exact values the static pricing file
-- already used, so switching the Billing page over to read from this table
-- doesn't change anyone's price today.
INSERT INTO admin_pricing_plans (plan_key, region, name, currency, monthly_price, yearly_price, invoice_limit, client_limit, team_limit, popular, sort_order)
SELECT * FROM (VALUES
  ('free', 'india', 'Free', 'INR', 0::numeric, 0::numeric, 3, 10, 0, false, 1),
  ('pro', 'india', 'Pro', 'INR', 12499::numeric, 12499::numeric, 500, 500, 3, true, 2),
  ('business', 'india', 'Business', 'INR', 20999::numeric, 20999::numeric, NULL, NULL, NULL, false, 3)
) AS seed(plan_key, region, name, currency, monthly_price, yearly_price, invoice_limit, client_limit, team_limit, popular, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM admin_pricing_plans p WHERE p.plan_key = seed.plan_key AND p.region = 'india');

-- Promo code validation, centralized so the Billing page and any future
-- checkout flow apply the exact same rules (active, date window, usage
-- limit, plan/billing-cycle scope) rather than re-implementing them.
CREATE OR REPLACE FUNCTION public.validate_promo_code(p_code text, p_plan text, p_cycle text)
RETURNS TABLE(valid boolean, reason text, discount_type text, discount_value numeric, promo_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_promo admin_promo_codes%ROWTYPE;
BEGIN
  SELECT * INTO v_promo FROM admin_promo_codes WHERE lower(code) = lower(p_code);

  IF v_promo.id IS NULL THEN
    RETURN QUERY SELECT false, 'Code not found', NULL::text, NULL::numeric, NULL::uuid;
    RETURN;
  END IF;
  IF NOT v_promo.active THEN
    RETURN QUERY SELECT false, 'This code is no longer active', NULL::text, NULL::numeric, NULL::uuid;
    RETURN;
  END IF;
  IF v_promo.starts_at IS NOT NULL AND now() < v_promo.starts_at THEN
    RETURN QUERY SELECT false, 'This code is not active yet', NULL::text, NULL::numeric, NULL::uuid;
    RETURN;
  END IF;
  IF v_promo.expires_at IS NOT NULL AND now() > v_promo.expires_at THEN
    RETURN QUERY SELECT false, 'This code has expired', NULL::text, NULL::numeric, NULL::uuid;
    RETURN;
  END IF;
  IF v_promo.usage_limit IS NOT NULL AND v_promo.usage_count >= v_promo.usage_limit THEN
    RETURN QUERY SELECT false, 'This code has reached its usage limit', NULL::text, NULL::numeric, NULL::uuid;
    RETURN;
  END IF;
  IF NOT (p_plan = ANY(v_promo.applies_to)) THEN
    RETURN QUERY SELECT false, 'This code does not apply to the selected plan', NULL::text, NULL::numeric, NULL::uuid;
    RETURN;
  END IF;
  IF v_promo.billing_scope <> 'all' AND v_promo.billing_scope <> p_cycle THEN
    RETURN QUERY SELECT false, 'This code only applies to ' || v_promo.billing_scope || ' billing', NULL::text, NULL::numeric, NULL::uuid;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, NULL::text, v_promo.discount_type, v_promo.discount_value, v_promo.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_promo_code(text, text, text) TO authenticated;
