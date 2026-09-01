-- Root cause of "dashboard price changes but checkout still charges the old
-- price": Paddle Checkout always charges whatever a fixed Paddle "Price"
-- object (VITE_PADDLE_*_PRICE_ID) says, in Paddle's own system. The Admin
-- "Plans & Pricing" editor only ever updated admin_pricing_plans in our own
-- DB -- it never told Paddle anything, so the live Price object (and the
-- amount it charges) never changed. This is the exact same class of bug the
-- admin_promo_codes / paddle-offers sync already solves for promo codes; we
-- mirror that pattern here for plan prices.
--
-- Each admin_pricing_plans row (one per plan_key + region) needs one Paddle
-- product and up to two Paddle prices (monthly recurring, yearly recurring).

ALTER TABLE admin_pricing_plans ADD COLUMN IF NOT EXISTS paddle_product_id text;
ALTER TABLE admin_pricing_plans ADD COLUMN IF NOT EXISTS paddle_monthly_price_id text;
ALTER TABLE admin_pricing_plans ADD COLUMN IF NOT EXISTS paddle_yearly_price_id text;
ALTER TABLE admin_pricing_plans ADD COLUMN IF NOT EXISTS paddle_synced boolean NOT NULL DEFAULT false;
ALTER TABLE admin_pricing_plans ADD COLUMN IF NOT EXISTS paddle_sync_status text NOT NULL DEFAULT 'not_synced';
ALTER TABLE admin_pricing_plans ADD COLUMN IF NOT EXISTS paddle_last_synced_at timestamptz;
ALTER TABLE admin_pricing_plans ADD COLUMN IF NOT EXISTS paddle_last_error text;
