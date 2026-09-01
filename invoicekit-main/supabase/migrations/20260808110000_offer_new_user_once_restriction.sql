-- Supports restricting a promo/offer to "new users only" and "one
-- redemption per user" -- previously any user (new or existing) could use
-- any active code an unlimited number of times (only a global usage_limit
-- existed, shared across everyone).

ALTER TABLE admin_promo_codes ADD COLUMN IF NOT EXISTS new_users_only boolean NOT NULL DEFAULT false;

-- Tracks whether a user has ever held a paid (pro/business) plan, so a
-- "new users only" offer can tell a genuinely new signup apart from an
-- existing/former paying customer. Backfilled from subscription history
-- and current plan; kept current going forward by the Paddle webhook.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS has_ever_subscribed boolean NOT NULL DEFAULT false;

UPDATE profiles SET has_ever_subscribed = true
WHERE has_ever_subscribed = false
  AND (plan IN ('pro', 'business') OR id IN (SELECT user_id FROM subscriptions));

-- One row per (offer, user) that has redeemed it -- the unique constraint
-- is what actually enforces "one time per user" at the database level.
CREATE TABLE IF NOT EXISTS admin_offer_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES admin_promo_codes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  transaction_id text,
  UNIQUE (offer_id, user_id)
);

ALTER TABLE admin_offer_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS owner_manage_offer_redemptions ON admin_offer_redemptions;
CREATE POLICY owner_manage_offer_redemptions ON admin_offer_redemptions FOR ALL TO authenticated
  USING (public.is_rivox_owner_admin()) WITH CHECK (public.is_rivox_owner_admin());

-- A signed-in user needs to read their own redemptions so the checkout
-- flow can decide client-side whether to still offer a "new users only" /
-- "one time" discount to them.
DROP POLICY IF EXISTS user_read_own_offer_redemptions ON admin_offer_redemptions;
CREATE POLICY user_read_own_offer_redemptions ON admin_offer_redemptions FOR SELECT TO authenticated
  USING (user_id = auth.uid());
