import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useRegion } from "../context/RegionContext";
import { FREE_PLAN_LIMIT } from "../lib/constants";
import {
  BillingCycle,
  GLOBAL_PLANS,
  INDIA_PLANS,
  Plan,
  PricingPlan,
  YEARLY_DISCOUNT_PERCENT,
  formatPlanPrice,
  getAnnualTotal,
  getPlanLimitLabel,
} from "../lib/pricing";
import { supabase } from "../lib/supabase";
import { openPaddleCheckout } from "../lib/paddle";
import { fetchPublicOffers, isOfferApplicable, type MarketingOffer } from "../lib/offers";

const BILLING_HISTORY = [
  { id: "1", date: "2026-06-15", invoiceNumber: "BILL-2026-001", plan: "Manual Pro", amount: 0, status: "active" },
];

function Modal({
  isOpen,
  title,
  message,
  confirmLabel,
  onConfirm,
  onClose,
  variant = "primary",
}: {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  variant?: "primary" | "danger";
}) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl animate-scale-in">
        <h3 className="text-lg font-bold text-slate-950">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary px-4 py-2 text-sm">Cancel</button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${
              variant === "danger" ? "bg-red-600 hover:bg-red-700" : "bg-primary-600 hover:bg-primary-700"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function BillingToggle({ cycle, setCycle }: { cycle: BillingCycle; setCycle: (cycle: BillingCycle) => void }) {
  return (
    <div className="inline-flex items-center rounded-full border border-slate-200 bg-white p-1 shadow-sm">
      <button
        onClick={() => setCycle("monthly")}
        className={`rounded-full px-4 py-2 text-sm font-semibold transition ${cycle === "monthly" ? "bg-slate-900 text-white" : "text-slate-600"}`}
      >
        Monthly
      </button>
      <button
        onClick={() => setCycle("yearly")}
        className={`rounded-full px-4 py-2 text-sm font-semibold transition ${cycle === "yearly" ? "bg-primary-600 text-white" : "text-slate-600"}`}
      >
        Yearly <span className="text-xs">Save {YEARLY_DISCOUNT_PERCENT}%</span>
      </button>
    </div>
  );
}

function PlanCard({
  plan,
  cycle,
  currentPlan,
  onUpgrade,
  loading,
}: {
  plan: PricingPlan;
  cycle: BillingCycle;
  currentPlan: Plan;
  onUpgrade: (plan: PricingPlan) => void;
  loading?: boolean;
}) {
  const isCurrent = currentPlan === plan.id;
  const isFree = plan.id === "free";
  return (
    <div className={`relative flex flex-col rounded-2xl border bg-white p-6 shadow-sm ${plan.featured ? "border-primary-500 ring-4 ring-primary-100" : "border-slate-200"}`}>
      {plan.featured && (
        <span className="absolute -top-3 left-6 rounded-full bg-primary-600 px-3 py-1 text-xs font-bold text-white">
          Most Popular
        </span>
      )}
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-primary-600">{plan.tagline}</p>
        <h3 className="mt-2 text-xl font-bold text-slate-950">{plan.name}</h3>
        <p className="mt-2 min-h-[44px] text-sm leading-6 text-slate-600">{plan.description}</p>
      </div>

      <div className="mt-5">
        <span className="text-4xl font-black text-slate-950">{formatPlanPrice(plan, cycle)}</span>
        {!isFree && <span className="ml-1 text-sm text-slate-500">/month</span>}
        {cycle === "yearly" && !isFree && (
          <p className="mt-1 text-xs font-semibold text-emerald-600">
            {plan.symbol}{getAnnualTotal(plan).toLocaleString("en-US")}/year billed yearly
          </p>
        )}
      </div>

      <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm">
        <p className="font-bold text-slate-900">{getPlanLimitLabel(plan.invoiceLimit, "invoices/month")}</p>
        <p className="mt-1 text-slate-500">
          {plan.teamMembers === 0 ? "No team seats" : plan.teamMembers === "unlimited" ? "Unlimited team seats" : `${plan.teamMembers} team seats`}
        </p>
      </div>

      <ul className="mt-5 flex-1 space-y-2">
        {plan.features.slice(0, 6).map((feature) => (
          <li key={feature} className="flex gap-2 text-sm text-slate-700">
            <span className="text-emerald-600">✓</span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={() => onUpgrade(plan)}
        disabled={isCurrent || isFree || loading}
        className={`mt-6 w-full rounded-xl px-4 py-3 text-sm font-bold transition ${
          isCurrent || isFree
            ? "cursor-not-allowed bg-slate-100 text-slate-500"
            : plan.featured
            ? "bg-primary-600 text-white hover:bg-primary-700"
            : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
        }`}
      >
        {loading ? "Opening checkout..." : isCurrent ? "Current Plan" : isFree ? "Free Plan" : plan.cta}
      </button>
    </div>
  );
}

export default function Billing() {
  const { user, profile } = useAuth();
  const region = useRegion();
  const [cycle, setCycle] = useState<BillingCycle>("yearly");
  const [invoicesThisMonth, setInvoicesThisMonth] = useState(0);
  const [promoCode, setPromoCode] = useState("");
  const [promoMessage, setPromoMessage] = useState<string | null>(null);
  const [offers, setOffers] = useState<MarketingOffer[]>([]);
  const [checkoutLoading, setCheckoutLoading] = useState<Plan | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [modal, setModal] = useState<null | { title: string; message: string; confirmLabel: string; onConfirm: () => void; variant?: "primary" | "danger" }>(null);

  const plans = region === "india" ? INDIA_PLANS : GLOBAL_PLANS;
  const planId: Plan = profile?.plan === "business" ? "business" : profile?.plan === "pro" || profile?.is_pro ? "pro" : "free";
  const current = plans[planId];
  const invoiceBalance = Number(profile?.credits ?? 0);
  const isUnlimited = current.invoiceLimit === "unlimited" || planId !== "free";

  useEffect(() => {
    async function loadUsage() {
      if (!user) return;
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const { count } = await supabase
        .from("invoices")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", monthStart.toISOString());
      setInvoicesThisMonth(count ?? 0);
    }
    loadUsage();
  }, [user]);

  useEffect(() => {
    let mounted = true;
    fetchPublicOffers().then((rows) => mounted && setOffers(rows)).catch(() => mounted && setOffers([]));
    return () => { mounted = false; };
  }, []);

  const usage = useMemo(() => {
    const freeUsed = Math.min(invoicesThisMonth, FREE_PLAN_LIMIT);
    const freeRemaining = Math.max(0, FREE_PLAN_LIMIT - freeUsed);
    const extraRemaining = Math.max(0, invoiceBalance);
    const totalRemaining = isUnlimited ? Number.POSITIVE_INFINITY : freeRemaining + extraRemaining;
    const totalLimit = isUnlimited ? Number.POSITIVE_INFINITY : FREE_PLAN_LIMIT + invoiceBalance;
    const percentage = isUnlimited ? 0 : Math.min(100, (invoicesThisMonth / Math.max(totalLimit, 1)) * 100);
    return { freeUsed, freeRemaining, extraRemaining, totalRemaining, totalLimit, percentage };
  }, [invoiceBalance, invoicesThisMonth, isUnlimited]);

  function handleUpgrade(plan: PricingPlan) {
    if (plan.id === "free") return;
    setCheckoutError(null);
    setModal({
      title: `Upgrade to ${plan.name}`,
      message: `Continue to the secure Paddle checkout for the ${plan.name} ${cycle} plan. Your plan activates automatically after payment confirmation.`,
      confirmLabel: "Continue to checkout",
      onConfirm: async () => {
        try {
          setCheckoutLoading(plan.id);
          await openPaddleCheckout({
            plan: plan.id as "pro" | "business",
            cycle,
            userId: user?.id,
            email: user?.email,
            discountCode: offers.find((offer) => offer.code === promoCode.trim().toUpperCase() && offer.paddle_synced && isOfferApplicable(offer, plan.id, cycle))?.code,
          });
        } catch (error) {
          setCheckoutError(error instanceof Error ? error.message : "Unable to start checkout.");
          setCheckoutLoading(null);
        }
      },
    });
  }

  function applyPromo() {
    const code = promoCode.trim().toUpperCase();
    const offer = offers.find((item) => item.code === code);
    if (!offer) {
      setPromoMessage("This offer is not active or has expired.");
      return;
    }
    const applicablePlans = (["pro", "business"] as const).filter((plan) => isOfferApplicable(offer, plan, cycle));
    if (applicablePlans.length === 0) {
      setPromoMessage(`This code is not available for ${cycle} billing.`);
      return;
    }
    const discount = offer.discount_type === "percentage" ? `${offer.discount_value}%` : `${offer.discount_value} fixed`;
    setPromoMessage(`${offer.code}: ${discount} off ${applicablePlans.join("/")} plans.${offer.paddle_synced ? " It will be sent to Paddle checkout." : " It is currently display-only until synced with Paddle."}`);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {new URLSearchParams(window.location.search).get("checkout") === "success" && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-800">
          Payment received. Your subscription is being activated; this page will update after the Paddle webhook is processed.
        </div>
      )}
      {checkoutError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">
          {checkoutError}
        </div>
      )}
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-primary-900 p-8 text-white shadow-xl">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-primary-200">Billing command center</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight">Manage your plan, usage, and invoice capacity.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              Upgrade when payments go live, track invoice usage, apply launch offers, and manage billing history from one place.
            </p>
          </div>
          <BillingToggle cycle={cycle} setCycle={setCycle} />
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-4">
        <div className="card p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Current Plan</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{current.name}</p>
          <p className="mt-1 text-sm text-slate-500">{planId === "free" ? "Manual/free access" : "Active access"}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Monthly Free</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{usage.freeRemaining}/{FREE_PLAN_LIMIT}</p>
          <p className="mt-1 text-sm text-slate-500">Free invoices remaining</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Extra Balance</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{isUnlimited ? "Unlimited" : usage.extraRemaining}</p>
          <p className="mt-1 text-sm text-slate-500">Admin-added invoice balance</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Total Remaining</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{isUnlimited ? "∞" : usage.totalRemaining}</p>
          <p className="mt-1 text-sm text-slate-500">Invoices you can still create</p>
        </div>
      </section>

      <section className="card p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Usage this month</h2>
            <p className="mt-1 text-sm text-slate-500">
              {isUnlimited ? "Your current plan has unlimited invoice creation." : `${invoicesThisMonth} invoices used out of ${usage.totalLimit}.`}
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700">
            {isUnlimited ? "Unlimited" : `${Math.round(usage.percentage)}% used`}
          </span>
        </div>
        {!isUnlimited && (
          <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-primary-600 transition-all" style={{ width: `${usage.percentage}%` }} />
          </div>
        )}
      </section>

      <section>
        <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-950">Available plans</h2>
            <p className="mt-1 text-sm text-slate-500">Choose monthly or yearly billing and continue to secure Paddle checkout.</p>
          </div>
          <div className="flex gap-2 rounded-xl border border-slate-200 bg-white p-2">
            <input
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value)}
              placeholder="Promo code"
              className="input h-10 min-w-[160px]"
            />
            <button onClick={applyPromo} className="btn-secondary h-10 px-4 text-sm">Apply</button>
          </div>
        </div>
        {promoMessage && <p className="mb-4 rounded-xl bg-primary-50 p-3 text-sm font-medium text-primary-700">{promoMessage}</p>}
        <div className="grid gap-6 lg:grid-cols-3">
          {(["free", "pro", "business"] as Plan[]).map((id) => (
            <PlanCard key={id} plan={plans[id]} cycle={cycle} currentPlan={planId} onUpgrade={handleUpgrade} loading={checkoutLoading === id} />
          ))}
        </div>
      </section>

      {planId !== "free" && (
        <section className="card p-6">
          <h2 className="text-lg font-bold text-slate-950">Subscription actions</h2>
          <p className="mt-1 text-sm text-slate-500">These actions become active after payment gateway integration.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button className="btn-secondary" onClick={() => setModal({ title: "Manage Subscription", message: "Live billing portal will be available after payment gateway integration.", confirmLabel: "Got it", onConfirm: () => {} })}>
              Manage Subscription
            </button>
            <button className="btn-secondary" onClick={() => setModal({ title: "Download Receipts", message: "Receipts will appear here after live payments are enabled.", confirmLabel: "Got it", onConfirm: () => {} })}>
              Download Receipts
            </button>
            <button className="btn-danger" onClick={() => setModal({ title: "Cancel Subscription", message: "Cancellation will be available after live subscriptions are enabled.", confirmLabel: "Got it", variant: "danger", onConfirm: () => {} })}>
              Cancel Subscription
            </button>
          </div>
        </section>
      )}

      <section className="card">
        <div className="border-b border-slate-100 p-6">
          <h2 className="text-lg font-bold text-slate-950">Billing history</h2>
          <p className="mt-1 text-sm text-slate-500">Manual and future gateway receipts will appear here.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Date</th>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Receipt</th>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Plan</th>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {BILLING_HISTORY.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 text-sm text-slate-700">{new Date(item.date).toLocaleDateString("en-IN")}</td>
                  <td className="px-6 py-4 text-sm font-mono text-slate-600">{item.invoiceNumber}</td>
                  <td className="px-6 py-4 text-sm text-slate-700">{item.plan}</td>
                  <td className="px-6 py-4 text-sm font-bold text-slate-950">{item.amount === 0 ? "Free / Manual" : `${current.symbol}${item.amount}`}</td>
                  <td className="px-6 py-4"><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">{item.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {modal && (
        <Modal
          isOpen={!!modal}
          title={modal.title}
          message={modal.message}
          confirmLabel={modal.confirmLabel}
          variant={modal.variant}
          onConfirm={modal.onConfirm}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
