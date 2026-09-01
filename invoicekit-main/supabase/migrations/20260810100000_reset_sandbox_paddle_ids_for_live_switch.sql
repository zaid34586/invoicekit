-- The account just switched from Paddle sandbox to production (PADDLE_ENV
-- changed, live API key saved). The Paddle product/price/discount IDs
-- already stored in these tables were created against the SANDBOX Paddle
-- account -- sandbox and live are entirely separate Paddle accounts with
-- separate data, so those IDs don't exist in the live account. The sync
-- functions PATCH an existing ID when one is stored, which now 404s
-- ("Product not found") against the live API.
--
-- Clearing these forces the next "Sync Paddle" / "Re-sync Paddle" click to
-- create brand-new Product/Price/Discount objects in the live account
-- instead of trying to update sandbox-only ones.

UPDATE admin_pricing_plans SET
  paddle_product_id = NULL,
  paddle_monthly_price_id = NULL,
  paddle_yearly_price_id = NULL,
  paddle_synced = false,
  paddle_sync_status = 'not_synced',
  paddle_last_synced_at = NULL,
  paddle_last_error = NULL
WHERE paddle_product_id IS NOT NULL OR paddle_monthly_price_id IS NOT NULL OR paddle_yearly_price_id IS NOT NULL;

UPDATE admin_promo_codes SET
  paddle_discount_id = NULL,
  paddle_synced = false,
  paddle_sync_status = 'not_synced',
  paddle_last_synced_at = NULL,
  paddle_last_error = NULL
WHERE paddle_discount_id IS NOT NULL;
