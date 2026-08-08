-- Root cause of "landing page still shows hardcoded prices even after the
-- fix": the only SELECT policy on admin_pricing_plans restricts reads to
-- the 'authenticated' role. /billing works because a signed-in user is
-- authenticated. The public landing page (getrivox.vercel.app) is visited
-- by people who have NOT signed in yet -- their request runs as the 'anon'
-- role, which this policy silently denies, so the fetch returns nothing
-- and the page falls back to the hardcoded static plan data.

DROP POLICY IF EXISTS public_read_active_pricing_plans ON public.admin_pricing_plans;
CREATE POLICY public_read_active_pricing_plans ON public.admin_pricing_plans
  FOR SELECT TO anon
  USING (active);
