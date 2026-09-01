-- Product is international/global only -- there should never have been a
-- separate India (INR) pricing row per plan in the admin editor. The
-- earlier migration (20260802140000_wire_pricing_promo_to_customer.sql)
-- added a `region` column and seeded India rows to mirror what the static
-- src/lib/pricing.ts file already had (INDIA_PLANS), which turned "3 plans"
-- into "6 cards" in Admin > Plans & Pricing. Removing those India rows
-- restores the original 3-plan admin experience (Free/Pro/Business, single
-- global price each). The static INDIA_PLANS fallback in pricing.ts is left
-- untouched -- this only removes the admin-editable India override rows,
-- it does not change how currency is picked for Indian visitors elsewhere.

DELETE FROM admin_pricing_plans WHERE region = 'india';
