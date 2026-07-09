import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { INDIA_PLANS, GLOBAL_PLANS } from "../../lib/pricing";
import { useRegion } from "../../context/RegionContext";

type BillingCycle = "monthly" | "yearly";

const planFeatures = {
  free: ["3 invoices / month", "PDF export", "Basic dashboard", "Client management"],
  pro: ["500 invoices / month", "Remove watermark", "Payment links", "Reports", "Priority support"],
  business: ["Unlimited invoices", "Team members", "Advanced analytics", "API access", "Custom branding"],
};

export default function Pricing() {
  const region = useRegion();
  const plans = region === "india" ? INDIA_PLANS : GLOBAL_PLANS;
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");

  const computedPlans = useMemo(() => {
    const yearlyDiscount = 0.67;
    return Object.values(plans).map((plan) => {
      const monthlyPrice = plan.price;
      const price = billingCycle === "yearly" && monthlyPrice > 0 ? Math.round(monthlyPrice * yearlyDiscount) : monthlyPrice;
      return { ...plan, price, originalPrice: monthlyPrice, billingCycle };
    });
  }, [plans, billingCycle]);

  return (
    <section id="pricing" className="relative overflow-hidden bg-slate-950 py-24 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#1d4ed8_0,transparent_34%)] opacity-30" />
      <div className="relative mx-auto max-w-7xl px-5 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <span className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-black text-blue-100">Pricing that can scale with your business</span>
          <h2 className="mt-6 text-4xl font-black tracking-tight sm:text-5xl">Choose the plan that fits your billing workflow.</h2>
          <p className="mt-5 text-lg leading-8 text-slate-300">Start free, upgrade when you need payment links, reporting, team workflows and advanced controls.</p>

          <div className="mt-8 inline-flex rounded-2xl border border-white/10 bg-white/10 p-1 shadow-2xl">
            <button
              type="button"
              onClick={() => setBillingCycle("monthly")}
              className={`rounded-xl px-5 py-3 text-sm font-black transition ${billingCycle === "monthly" ? "bg-white text-slate-950" : "text-slate-300 hover:text-white"}`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle("yearly")}
              className={`rounded-xl px-5 py-3 text-sm font-black transition ${billingCycle === "yearly" ? "bg-white text-slate-950" : "text-slate-300 hover:text-white"}`}
            >
              Yearly <span className="ml-1 rounded-full bg-emerald-400/20 px-2 py-0.5 text-emerald-200">Save 33%</span>
            </button>
          </div>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {computedPlans.map((plan) => {
            const isPro = plan.id === "pro";
            const features = planFeatures[plan.id];
            return (
              <div
                key={plan.id}
                className={`relative rounded-[2rem] p-8 shadow-2xl transition hover:-translate-y-1 ${
                  isPro ? "bg-white text-slate-950 ring-4 ring-blue-500/30" : "border border-white/10 bg-white/[0.06] text-white"
                }`}
              >
                {isPro && (
                  <span className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-blue-700 px-5 py-2 text-xs font-black uppercase tracking-wide text-white shadow-lg">
                    Most Popular
                  </span>
                )}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-2xl font-black">{plan.name}</h3>
                    <p className={`mt-2 text-sm ${isPro ? "text-slate-500" : "text-slate-300"}`}>
                      {plan.id === "free" ? "For testing and light usage" : plan.id === "pro" ? "For growing businesses" : "For teams and advanced billing"}
                    </p>
                  </div>
                  {plan.id === "business" && <span className="rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-black text-indigo-200">Team-ready</span>}
                </div>

                <div className="mt-8">
                  <div className="flex items-end gap-2">
                    <span className="text-5xl font-black">{plan.symbol}{plan.price}</span>
                    {plan.price > 0 && <span className={`pb-2 text-sm font-bold ${isPro ? "text-slate-500" : "text-slate-300"}`}>/mo</span>}
                  </div>
                  {billingCycle === "yearly" && plan.price > 0 && (
                    <p className={`mt-2 text-sm ${isPro ? "text-slate-500" : "text-slate-300"}`}>
                      Billed yearly. Usually {plan.symbol}{plan.originalPrice}/mo.
                    </p>
                  )}
                  {plan.price === 0 && <p className={`mt-2 text-sm ${isPro ? "text-slate-500" : "text-slate-300"}`}>Forever free</p>}
                </div>

                <ul className="mt-8 space-y-3">
                  {features.map((feature) => (
                    <li key={feature} className={`flex gap-3 text-sm font-semibold ${isPro ? "text-slate-700" : "text-slate-200"}`}>
                      <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">✓</span>
                      {feature}
                    </li>
                  ))}
                </ul>

                <Link
                  to={plan.id === "business" ? "/signup" : "/signup"}
                  className={`mt-9 inline-flex w-full items-center justify-center rounded-2xl px-5 py-3.5 text-sm font-black transition ${
                    isPro ? "bg-blue-700 text-white shadow-xl shadow-blue-700/25 hover:bg-blue-800" : "bg-white text-slate-950 hover:bg-blue-50"
                  }`}
                >
                  {plan.id === "free" ? "Start Free" : plan.id === "pro" ? "Upgrade to Pro" : "Start Business"}
                </Link>
              </div>
            );
          })}
        </div>

        <div className="mt-10 rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 text-center text-sm font-semibold text-slate-300">
          Admin-editable coupons, yearly offers and business plan limits are ready for the next billing sprint.
        </div>
      </div>
    </section>
  );
}
