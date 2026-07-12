import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { openPaddleCheckout } from "../../lib/paddle";
import { useRegion } from "../../context/RegionContext";
import { formatOfferDiscount, getOfferForPlanCycle, loadActiveMarketingOffers, type MarketingOffer } from "../../lib/offers";
import { trackGrowthEvent } from "../../lib/growth";
import {
  BillingCycle,
  GLOBAL_PLANS,
  INDIA_PLANS,
  Plan,
  PricingPlan,
  formatPlanPrice,
  getAnnualTotal,
  getPlanLimitLabel,
} from "../../lib/pricing";

function BillingToggle({ cycle, setCycle }: { cycle: BillingCycle; setCycle: (cycle: BillingCycle) => void }) {
  return (
    <div className="inline-flex items-center rounded-full border border-slate-200 bg-white p-1 shadow-sm">
      <button
        onClick={() => setCycle("monthly")}
        className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
          cycle === "monthly" ? "bg-slate-900 text-white shadow" : "text-slate-600 hover:text-slate-900"
        }`}
      >
        Monthly
      </button>
      <button
        onClick={() => setCycle("yearly")}
        className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
          cycle === "yearly" ? "bg-primary-600 text-white shadow" : "text-slate-600 hover:text-slate-900"
        }`}
      >
        Yearly
      </button>
    </div>
  );
}

function PricingCard({
  plan,
  cycle,
  offer,
  onSelect,
  loading,
}: {
  plan: PricingPlan;
  cycle: BillingCycle;
  offer?: MarketingOffer;
  onSelect: (plan: PricingPlan, offer?: MarketingOffer) => void;
  loading: boolean;
}) {
  const isFree = plan.id === "free";
  return (
    <div
      className={`relative flex h-full flex-col rounded-3xl border bg-white p-8 shadow-sm transition hover:-translate-y-1 hover:shadow-xl ${
        plan.featured ? "border-primary-500 ring-4 ring-primary-100" : "border-slate-200"
      }`}
    >
      {plan.featured && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-primary-600 px-4 py-1 text-xs font-bold uppercase tracking-wide text-white shadow-lg">
          Most Popular
        </div>
      )}

      <div>
        <p className="text-sm font-semibold text-primary-600">{plan.tagline}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h3 className="text-2xl font-bold text-slate-950">{plan.name}</h3>
          {offer && !isFree && (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">
              {formatOfferDiscount(offer)}
            </span>
          )}
        </div>
        <p className="mt-3 min-h-[48px] text-sm leading-6 text-slate-600">{plan.description}</p>
      </div>

      <div className="mt-7">
        <div className="flex items-end gap-2">
          <span className="text-5xl font-black tracking-tight text-slate-950">{formatPlanPrice(plan, cycle)}</span>
          {!isFree && <span className="pb-2 text-sm font-medium text-slate-500">/month</span>}
        </div>
        {cycle === "yearly" && !isFree && (
          <p className="mt-2 text-sm font-medium text-emerald-600">
            Billed yearly: {plan.symbol}{getAnnualTotal(plan).toLocaleString("en-US")}/year
          </p>
        )}
        {offer && !isFree && (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-black text-emerald-900">{offer.label}</p>
            <p className="mt-1 text-xs font-medium text-emerald-700">
              Promo code <span className="font-mono font-black">{offer.code}</span> applies at secure checkout.
            </p>
          </div>
        )}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-4 text-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Invoices</p>
          <p className="mt-1 font-bold text-slate-900">{getPlanLimitLabel(plan.invoiceLimit, "")}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Team</p>
          <p className="mt-1 font-bold text-slate-900">
            {plan.teamMembers === 0 ? "No team" : plan.teamMembers === "unlimited" ? "Unlimited" : `${plan.teamMembers} seats`}
          </p>
        </div>
      </div>

      <ul className="mt-7 flex-1 space-y-3">
        {plan.features.map((feature) => (
          <li key={feature} className="flex gap-3 text-sm text-slate-700">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">✓</span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={() => onSelect(plan, offer)}
        disabled={loading}
        className={`mt-8 w-full rounded-xl px-5 py-3 text-sm font-bold transition ${
          plan.featured ? "bg-primary-600 text-white shadow-lg hover:bg-primary-700" : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
        }`}
      >
        {loading ? "Opening checkout..." : plan.cta}
      </button>
    </div>
  );
}

export default function Pricing() {
  const region = useRegion();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [cycle, setCycle] = useState<BillingCycle>("yearly");
  const [offers, setOffers] = useState<MarketingOffer[]>([]);
  const [loadingPlan, setLoadingPlan] = useState<Plan | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const plans = region === "india" ? INDIA_PLANS : GLOBAL_PLANS;
  const orderedPlans: Plan[] = ["free", "pro", "business"];

  useEffect(() => {
    loadActiveMarketingOffers().then((items) => {
      setOffers(items);
      items.forEach((offer) => void trackGrowthEvent({ event: "offer_view", offerId: offer.id }));
    });
  }, []);

  async function selectPlan(plan: PricingPlan, offer?: MarketingOffer) {
    if (plan.id === "free") {
      navigate(user ? "/dashboard" : "/signup");
      return;
    }
    if (!user) {
      const offerQuery = offer ? `&promo=${encodeURIComponent(offer.code)}` : "";
      navigate(`/login?next=/billing&plan=${plan.id}&cycle=${cycle}${offerQuery}`);
      return;
    }
    setCheckoutError(null);
    if (offer) void trackGrowthEvent({ event: "offer_click", offerId: offer.id, plan: plan.id, billingCycle: cycle });
    void trackGrowthEvent({ event: "checkout_start", offerId: offer?.id, plan: plan.id, billingCycle: cycle });
    setLoadingPlan(plan.id);
    try {
      await openPaddleCheckout({
        plan: plan.id,
        cycle,
        userId: user.id,
        email: user.email,
        discountCode: offer?.paddleDiscountId ? undefined : offer?.code,
        discountId: offer?.paddleDiscountId ?? undefined,
        offerId: offer?.id,
      });
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Unable to open Paddle checkout.");
    } finally {
      setLoadingPlan(null);
    }
  }

  return (
    <section id="pricing" className="scroll-mt-24 relative overflow-hidden bg-slate-50 py-24">
      <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-primary-50 to-transparent" />
      <div className="relative mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex rounded-full bg-primary-100 px-4 py-1 text-xs font-bold uppercase tracking-wide text-primary-700">Pricing built for growth</span>
          <h2 className="mt-5 text-4xl font-black tracking-tight text-slate-950 md:text-5xl">Choose a plan that matches your business stage.</h2>
          <p className="mt-5 text-lg leading-8 text-slate-600">Start free, upgrade when you need payment links, higher invoice limits, team access, API, and advanced analytics.</p>
          <div className="mt-8"><BillingToggle cycle={cycle} setCycle={setCycle} /></div>
        </div>

        {checkoutError && <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">{checkoutError}</div>}

        <div className="mt-14 grid gap-8 lg:grid-cols-3">
          {orderedPlans.map((id) => (
            <PricingCard
              key={id}
              plan={plans[id]}
              cycle={cycle}
              offer={getOfferForPlanCycle(offers, id, cycle)}
              onSelect={selectPlan}
              loading={loadingPlan === id}
            />
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-slate-500">Secure checkout is powered by Paddle. Taxes and supported local currencies are calculated at checkout.</p>
      </div>
    </section>
  );
}
