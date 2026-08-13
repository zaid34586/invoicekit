-- Enables the extensions needed to schedule an automatic sweep of
-- pending/failed webhook deliveries (business-webhooks "cron-sweep"
-- action), instead of deliveries only ever being retried when a customer
-- happens to create or edit an invoice/client themselves.
--
-- pg_net is what lets a scheduled Postgres job make an outbound HTTPS call
-- to the edge function (a plain SQL/plpgsql function can't do that on its
-- own). Both extensions gracefully no-op with a notice if unavailable on
-- this plan, matching 20260730190000_automation_engine_phase3_sla_check.sql.

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION WHEN insufficient_privilege OR feature_not_supported THEN
  RAISE NOTICE 'pg_cron not available on this plan -- enable it in Supabase Dashboard > Database > Extensions.';
END $$;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net;
EXCEPTION WHEN insufficient_privilege OR feature_not_supported THEN
  RAISE NOTICE 'pg_net not available on this plan -- enable it in Supabase Dashboard > Database > Extensions.';
END $$;
