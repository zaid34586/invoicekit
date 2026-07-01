import { INDIA_PLANS, GLOBAL_PLANS } from "../../lib/pricing";
import { useRegion } from "../../context/RegionContext";


export default function Pricing() {
    const region = useRegion();

const plans =
  region === "india"
    ? INDIA_PLANS
    : GLOBAL_PLANS;
  return (
    <section id="pricing" className="py-24 bg-slate-50">
      <div className="max-w-7xl mx-auto px-6">

        <div className="text-center">
          <h2 className="text-4xl font-bold text-slate-900">
            Simple & Transparent Pricing
          </h2>

          <p className="mt-4 text-slate-600">
            Start free and upgrade when your business grows.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8 mt-16">

          {/* Free */}
          <div className="rounded-2xl border bg-white p-8">
            <h3 className="text-2xl font-bold">Free</h3>
            <p className="text-5xl font-bold mt-6">
  {plans.free.symbol}{plans.free.price}
</p>
            <p className="text-slate-500 mt-2">Forever</p>

            <ul className="mt-8 space-y-3 text-slate-600">
              <li>✓ 3 Invoices / Month</li>
              <li>✓ PDF Export</li>
              <li>✓ Client Management</li>
            </ul>

            <button className="w-full mt-8 btn-secondary">
              Get Started
            </button>
          </div>

          {/* Pro */}
          <div className="rounded-2xl border-2 border-primary-600 bg-white p-8 shadow-xl relative">

            <span className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary-600 text-white px-4 py-1 rounded-full text-sm">
              Most Popular
            </span>

            <h3 className="text-2xl font-bold">Pro</h3>

            <p className="text-5xl font-bold mt-6">
  {plans.pro.symbol}{plans.pro.price}
</p>

            <p className="text-slate-500 mt-2">per month</p>

            <ul className="mt-8 space-y-3 text-slate-600">
              <li>✓ Unlimited Invoices</li>
              <li>✓ No Watermark</li>
              <li>✓ Email & WhatsApp Sharing</li>
              <li>✓ Reports</li>
              <li>✓ Priority Support</li>
            </ul>

            <button className="w-full mt-8 btn-primary">
              Upgrade to Pro
            </button>

          </div>

          {/* Business */}

          <div className="rounded-2xl border bg-white p-8">

            <h3 className="text-2xl font-bold">
              Business
            </h3>

           <p className="text-5xl font-bold mt-6">
  {plans.business.symbol}{plans.business.price}
</p>

            <p className="text-slate-500 mt-2">
              per month
            </p>

            <ul className="mt-8 space-y-3 text-slate-600">
              <li>✓ Everything in Pro</li>
              <li>✓ Team Members</li>
              <li>✓ Advanced Reports</li>
              <li>✓ API Access (Coming Soon)</li>
            </ul>

            <button className="w-full mt-8 btn-secondary">
              Contact Sales
            </button>

          </div>

        </div>

      </div>
    </section>
  );
}