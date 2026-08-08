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
  formatPlanPrice,
  getAnnualTotal,
  getPlanPrice,
  getPlanLimitLabel,
} from "../lib/pricing";
import { supabase } from "../lib/supabase";
import { openPaddleCheckout, paddleEnvironment } from "../lib/paddle";
import { formatOfferDiscount, filterOffersForUser, getOfferForPlanCycle, loadActiveMarketingOffers, type MarketingOffer } from "../lib/offers";
import { trackGrowthEvent } from "../lib/growth";
import {
  cancelPaddleSubscription,
  createPaddlePortalSession,
  loadPaddleSubscriptionStatus,
  reportPaddleActivationDelay,
  syncPaddleTransaction,
  undoScheduledPaddleCancellation,
  type BillingEventRecord,
  type PaddleSubscriptionRecord,
} from "../lib/paddleSubscription";



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
        Yearly
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
  offer,
}: {
  plan: PricingPlan;
  cycle: BillingCycle;
  currentPlan: Plan;
  onUpgrade: (plan: PricingPlan, offer?: MarketingOffer) => void;
  loading?: boolean;
  offer?: MarketingOffer;
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
        <div className="mt-2 flex flex-wrap items-center gap-2"><h3 className="text-xl font-bold text-slate-950">{plan.name}</h3>{offer && !isFree && <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-700">{formatOfferDiscount(offer)}</span>}</div>
        <p className="mt-2 min-h-[44px] text-sm leading-6 text-slate-600">{plan.description}</p>
      </div>

      <div className="mt-5">
        {offer && !isFree ? (
          <>
            <span className="text-lg font-bold text-slate-400 line-through">{formatPlanPrice(plan, cycle)}</span>
            <span className="ml-2 text-4xl font-black text-emerald-600">{plan.symbol}{Math.max(0, getPlanPrice(plan, cycle) - (offer.discountType === "percentage" ? Math.round(getPlanPrice(plan, cycle) * offer.discountValue / 100) : offer.discountValue)).toLocaleString("en-US")}</span>
            <span className="ml-1 text-sm text-slate-500">/month</span>
          </>
        ) : (
          <>
            <span className="text-4xl font-black text-slate-950">{formatPlanPrice(plan, cycle)}</span>
            {!isFree && <span className="ml-1 text-sm text-slate-500">/month</span>}
          </>
        )}
        {cycle === "yearly" && !isFree && (
          <p className="mt-1 text-xs font-semibold text-emerald-600">
            {plan.symbol}
            {(
              // When a yearly offer is showing, the annual total must match
              // the discounted monthly-equivalent price above it (that
              // price * 12) -- not the plan's undiscounted base total,
              // which is what getAnnualTotal() alone gives.
              offer
                ? Math.max(0, getPlanPrice(plan, cycle) - (offer.discountType === "percentage" ? Math.round(getPlanPrice(plan, cycle) * offer.discountValue / 100) : offer.discountValue)) * 12
                : getAnnualTotal(plan)
            ).toLocaleString("en-US")}
            /year billed yearly
          </p>
        )}
      </div>

      {offer && !isFree && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-black text-emerald-900">{offer.label}</p>
          <p className="mt-1 text-xs font-medium text-emerald-700">Code <span className="font-mono font-black">{offer.code}</span> will be applied at checkout.</p>
        </div>
      )}

      <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm">
        <p className="font-bold text-slate-900">{getPlanLimitLabel(plan.invoiceLimit, "invoices/month")}</p>
        <p className="mt-1 text-slate-500">
          {plan.teamMembers === 0 ? "No team seats" : plan.teamMembers === "unlimited" ? "Unlimited team seats" : `${plan.teamMembers} team seats`}
        </p>
      </div>

      <ul className="mt-5 flex-1 space-y-2">
        {plan.features.map((feature) => (
          <li key={feature} className="flex gap-2 text-sm text-slate-700">
            <span className="text-emerald-600">✓</span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={() => onUpgrade(plan, offer)}
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
  const { user, profile, refreshProfile } = useAuth();
  const region = useRegion();
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [invoicesThisMonth, setInvoicesThisMonth] = useState(0);
  const [promoCode, setPromoCode] = useState("");
  const [promoMessage, setPromoMessage] = useState<string | null>(null);
  const [appliedCode, setAppliedCode] = useState<string | null>(null);
  const [offers, setOffers] = useState<MarketingOffer[]>([]);
  const [checkoutLoading, setCheckoutLoading] = useState<Plan | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<PaddleSubscriptionRecord | null>(null);
  const [billingEvents, setBillingEvents] = useState<BillingEventRecord[]>([]);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [subscriptionMessage, setSubscriptionMessage] = useState<string | null>(null);
  const subscriptionReady = Boolean(subscription?.provider_subscription_id && subscription?.provider_customer_id);
  const [modal, setModal] = useState<null | { title: string; message: string; confirmLabel: string; onConfirm: () => void; variant?: "primary" | "danger" }>(null);
  // Tracks the post-checkout "waiting for webhook" banner. Previously this
  // banner was driven ONLY by the `?checkout=success` URL param, so it
  // stayed up forever (even after activation succeeded, or if it never
  // will) — and the polling loop below gave up silently after 30s with no
  // visible error, leaving the user staring at "activating..." with no way
  // to know something was actually wrong. Now it has real states.
  const [activationStatus, setActivationStatus] = useState<"idle" | "waiting" | "success" | "timeout">("idle");

  const [priceOverrides, setPriceOverrides] = useState<Record<string, { monthly_price: number; yearly_price: number; invoice_limit: number | null; client_limit: number | null; team_limit: number | null; paddle_synced: boolean; paddle_monthly_price_id: string | null; paddle_yearly_price_id: string | null }>>({});

  useEffect(() => {
    void supabase.from("admin_pricing_plans").select("plan_key,region,monthly_price,yearly_price,invoice_limit,client_limit,team_limit,paddle_synced,paddle_monthly_price_id,paddle_yearly_price_id").eq("active", true).then(({ data }) => {
      const map: typeof priceOverrides = {};
      for (const row of (data as Array<{ plan_key: string; region: string; monthly_price: number; yearly_price: number; invoice_limit: number | null; client_limit: number | null; team_limit: number | null; paddle_synced: boolean; paddle_monthly_price_id: string | null; paddle_yearly_price_id: string | null }>) ?? []) {
        map[`${row.plan_key}:${row.region}`] = row;
      }
      setPriceOverrides(map);
    });
  }, []);

  // Looks up the region-aware, admin-synced Paddle Price ID for a plan/cycle
  // so checkout charges what the Admin dashboard actually shows. Falls back
  // to undefined (static env var) if that plan hasn't been synced yet.
  function dynamicPaddlePriceId(planKey: Plan, billingCycle: BillingCycle) {
    const regionKey = region === "india" ? "india" : "global";
    const override = priceOverrides[`${planKey}:${regionKey}`];
    if (!override?.paddle_synced) return undefined;
    return (billingCycle === "yearly" ? override.paddle_yearly_price_id : override.paddle_monthly_price_id) ?? undefined;
  }

  const plans = useMemo(() => {
    // Admin's Plans & Pricing editor writes to admin_pricing_plans -- this
    // was previously never read anywhere, so price changes there silently
    // never reached customers. This overlays those live numbers onto the
    // static plan data (features/description/etc stay from the static file,
    // since the DB table doesn't store those).
    const base = region === "india" ? INDIA_PLANS : GLOBAL_PLANS;
    const regionKey = region === "india" ? "india" : "global";
    const merged = { ...base };
    (Object.keys(merged) as Plan[]).forEach((key) => {
      const override = priceOverrides[`${key}:${regionKey}`];
      if (!override) return;
      merged[key] = {
        ...merged[key],
        monthlyPrice: Number(override.monthly_price),
        // admin_pricing_plans.yearly_price is the literal annual total (the
        // "Yearly total" field admin enters, e.g. 1800) -- but this plan
        // object's yearlyMonthlyPrice slot is the monthly-equivalent rate,
        // which getAnnualTotal() below multiplies by 12 to show the total.
        // Divide here so that round-trip recovers the admin's actual total
        // instead of multiplying it by 12 again (1800 -> was showing 21600).
        yearlyMonthlyPrice: Number(override.yearly_price) / 12,
        invoiceLimit: override.invoice_limit === null ? "unlimited" : override.invoice_limit,
        clientLimit: override.client_limit === null ? "unlimited" : override.client_limit,
        teamMembers: override.team_limit === null ? "unlimited" : override.team_limit,
      };
    });
    return merged;
  }, [region, priceOverrides]);
  const planId: Plan = profile?.plan === "business" ? "business" : profile?.plan === "pro" || profile?.is_pro ? "pro" : "free";
  const current = plans[planId];
  const invoiceBalance = Number(profile?.credits ?? 0);
  const isUnlimited = current.invoiceLimit === "unlimited";
  const planLimit = isUnlimited ? Number.POSITIVE_INFINITY : Number(current.invoiceLimit || FREE_PLAN_LIMIT);

  useEffect(() => {
    loadActiveMarketingOffers().then(async (items) => {
      const eligible = await filterOffersForUser(items, user?.id);
      setOffers(eligible);
      eligible.forEach((offer) => void trackGrowthEvent({ event: "offer_view", offerId: offer.id }));
    });
  }, [user?.id]);

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

  async function refreshSubscription() {
    if (!user) return null;
    setSubscriptionLoading(true);
    try {
      const status = await loadPaddleSubscriptionStatus();
      setSubscription(status.subscription);
      setBillingEvents(status.billingEvents);
      return status.subscription;
    } catch (error) {
      setSubscriptionMessage(error instanceof Error ? error.message : "Unable to load billing status.");
      return null;
    } finally {
      setSubscriptionLoading(false);
    }
  }

  // Initial load + "opened while webhook still processing" watcher.
  //
  // Previously this only did a single one-shot fetch. If the profile
  // already showed a paid plan but the `subscriptions` row hadn't yet
  // received its Paddle IDs (webhook still catching up), the page would
  // stay on "Awaiting Paddle sync" forever until the user manually
  // refreshed — nothing here ever re-checked. This now polls automatically
  // (every 2s, capped at 30s) in exactly that situation, and skips entirely
  // if the checkout-redirect effect below already owns the "waiting" flow
  // (so the two never poll the same thing at once).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let timer: number | undefined;

    (async () => {
      const fresh = await refreshSubscription();
      if (cancelled) return;

      const url = new URL(window.location.href);
      const cameFromCheckout =
        url.searchParams.get("checkout") === "success" ||
        Boolean(url.searchParams.get("_ptxn")) ||
        Boolean(url.searchParams.get("transaction_id")) ||
        Boolean(window.sessionStorage.getItem("rivox:last-paddle-transaction"));
      if (cameFromCheckout) return; // the effect below handles this case

      const ready = Boolean(fresh?.provider_subscription_id && fresh?.provider_customer_id);
      const planLooksPaid = profile?.is_pro || profile?.plan === "pro" || profile?.plan === "business";
      if (ready || !planLooksPaid) return; // already synced, or genuinely free — nothing to watch

      let attempts = 0;
      timer = window.setInterval(async () => {
        attempts += 1;
        const latest = await refreshSubscription();
        if (cancelled) return;
        const nowReady = Boolean(latest?.provider_subscription_id && latest?.provider_customer_id);
        if (nowReady || attempts >= 15) {
          if (timer) window.clearInterval(timer);
        }
      }, 2000);
    })();

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;

    const url = new URL(window.location.href);
    const transactionFromUrl =
      url.searchParams.get("_ptxn") ||
      url.searchParams.get("transaction_id") ||
      "";
    const transactionFromSession = window.sessionStorage.getItem("rivox:last-paddle-transaction") || "";
    const transactionId = transactionFromUrl.startsWith("txn_")
      ? transactionFromUrl
      : transactionFromSession.startsWith("txn_")
        ? transactionFromSession
        : "";
    const checkoutSucceeded = url.searchParams.get("checkout") === "success" || Boolean(transactionId);
    if (!checkoutSucceeded) return;

    url.searchParams.delete("checkout");
    url.searchParams.delete("_ptxn");
    url.searchParams.delete("transaction_id");
    window.history.replaceState({}, "", url.toString());

    let cancelled = false;
    let timer: number | undefined;
    let attempts = 0;
    let escalationReported = false;
    setActivationStatus("waiting");
    setSubscriptionMessage(null);

    const finishActivation = async (escalate = false) => {
      if (transactionId) {
        try {
          const synced = escalate
            ? await reportPaddleActivationDelay(transactionId, paddleEnvironment)
            : await syncPaddleTransaction(transactionId, paddleEnvironment);
          if (cancelled) return true;
          setSubscription(synced.subscription);
          setBillingEvents(synced.billingEvents);
          window.sessionStorage.removeItem("rivox:last-paddle-transaction");
          const freshProfile = await refreshProfile();
          if (cancelled) return true;
          const active = freshProfile?.is_pro || freshProfile?.plan === "pro" || freshProfile?.plan === "business";
          const ready = Boolean(
            synced.subscription?.provider_subscription_id && synced.subscription?.provider_customer_id
          );
          // Previously this declared "success" as soon as the PROFILE showed
          // a paid plan, without checking whether the subscription record's
          // Paddle IDs had actually been written yet. If those two updates
          // landed in slightly different order, polling stopped here while
          // the badge/buttons (which key off the IDs, not the plan) stayed
          // stuck on "Awaiting Paddle sync" forever — exactly the reported
          // bug. Now both must be true before we stop polling.
          if (active && ready) {
            setActivationStatus("success");
            return true;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unable to verify the Paddle payment.";
          setSubscriptionMessage(message);
          // 409 can be temporary while Paddle finishes creating identifiers.
          if (!message.toLowerCase().includes("not ready") && !message.toLowerCase().includes("not completed")) {
            setActivationStatus("timeout");
            return true;
          }
        }
      }

      const [freshSub, freshProfile] = await Promise.all([refreshSubscription(), refreshProfile()]);
      if (cancelled) return true;
      const active = freshProfile?.is_pro || freshProfile?.plan === "pro" || freshProfile?.plan === "business";
      const ready = Boolean(freshSub?.provider_subscription_id && freshSub?.provider_customer_id);
      if (active && ready) {
        setActivationStatus("success");
        return true;
      }
      return false;
    };

    const poll = async () => {
      attempts += 1;
      if (attempts === 6) {
        setSubscriptionMessage("Payment received. Rivox is running a secure Paddle recovery check.");
      }
      const shouldEscalate = attempts >= 11 && !escalationReported;
      if (shouldEscalate) {
        escalationReported = true;
        setSubscriptionMessage("Activation is taking longer than expected. Secure recovery is running and the Rivox team will be notified if review is needed.");
      }
      const done = await finishActivation(shouldEscalate);
      if (done) {
        if (timer) window.clearInterval(timer);
        return;
      }
      if (attempts >= 15) {
        setActivationStatus("timeout");
        if (timer) window.clearInterval(timer);
      }
    };

    void poll();
    timer = window.setInterval(() => void poll(), 2000);
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [user?.id]);

  async function openPortal(mode: "overview" | "cancel" | "payment_method") {
    setSubscriptionMessage(null);
    setSubscriptionLoading(true);
    try {
      const url = await createPaddlePortalSession(mode);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setSubscriptionMessage(error instanceof Error ? error.message : "Unable to open Paddle portal.");
    } finally {
      setSubscriptionLoading(false);
    }
  }

  async function requestCancellation() {
    setSubscriptionMessage(null);
    setSubscriptionLoading(true);
    try {
      const updated = await cancelPaddleSubscription("next_billing_period");
      setSubscription(updated);
      setSubscriptionMessage("Cancellation scheduled for the end of the current billing period.");
      await refreshSubscription();
    } catch (error) {
      setSubscriptionMessage(error instanceof Error ? error.message : "Unable to cancel subscription.");
    } finally {
      setSubscriptionLoading(false);
    }
  }

  async function undoCancellation() {
    setSubscriptionMessage(null);
    setSubscriptionLoading(true);
    try {
      const updated = await undoScheduledPaddleCancellation();
      setSubscription(updated);
      setSubscriptionMessage("Scheduled cancellation removed. Your subscription will continue.");
      await refreshSubscription();
    } catch (error) {
      setSubscriptionMessage(error instanceof Error ? error.message : "Unable to keep subscription active.");
    } finally {
      setSubscriptionLoading(false);
    }
  }

  const usage = useMemo(() => {
    const baseLimit = planId === "free" ? FREE_PLAN_LIMIT : planLimit;
    const extraRemaining = planId === "free" ? Math.max(0, invoiceBalance) : 0;
    const totalLimit = isUnlimited ? Number.POSITIVE_INFINITY : baseLimit + extraRemaining;
    const totalRemaining = isUnlimited ? Number.POSITIVE_INFINITY : Math.max(0, totalLimit - invoicesThisMonth);
    const percentage = isUnlimited ? 0 : Math.min(100, (invoicesThisMonth / Math.max(totalLimit, 1)) * 100);
    return { baseLimit, extraRemaining, totalRemaining, totalLimit, percentage };
  }, [invoiceBalance, invoicesThisMonth, isUnlimited, planId, planLimit]);

  function handleUpgrade(plan: PricingPlan, offer?: MarketingOffer) {
    if (plan.id === "free") return;
    if (offer) void trackGrowthEvent({ event: "offer_click", offerId: offer.id, plan: plan.id, billingCycle: cycle });
    setCheckoutError(null);
    setModal({
      title: `Upgrade to ${plan.name}`,
      message: `Continue to the secure Paddle checkout for the ${plan.name} ${cycle} plan. Your plan activates automatically after payment confirmation.`,
      confirmLabel: "Continue to checkout",
      onConfirm: async () => {
        void trackGrowthEvent({ event: "checkout_start", offerId: offer?.id, plan: plan.id, billingCycle: cycle });
        try {
          setCheckoutLoading(plan.id);
          await openPaddleCheckout({
            plan: plan.id as "pro" | "business",
            cycle,
            userId: user?.id,
            email: user?.email,
            discountCode: promoCode.trim() || (offer?.paddleDiscountId ? undefined : offer?.code) || undefined,
            discountId: promoCode.trim() ? undefined : offer?.paddleDiscountId ?? undefined,
            offerId: offer?.id,
            priceId: dynamicPaddlePriceId(plan.id, cycle),
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
    const offer = offers.find((item) => item.code.toUpperCase() === code);
    if (!offer) {
      setAppliedCode(null);
      setPromoMessage("This code is not active or not available for your account. Check for typos, or it may have expired.");
      return;
    }
    setAppliedCode(offer.code);
    setPromoMessage(`${offer.code} applied: ${formatOfferDiscount(offer)} on ${offer.appliesTo.join(" & ")} (${offer.billingScope === "all" ? "monthly and yearly" : offer.billingScope}). See it on the matching plan card below.`);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {activationStatus === "waiting" && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-800">
          Payment received. Your subscription is being activated; this page will update automatically in a few seconds.
        </div>
      )}
      {activationStatus === "success" && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-800">
          🎉 Your plan is now active.
        </div>
      )}
      {activationStatus === "timeout" && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-medium text-amber-800">
          Payment received, but activation is taking longer than expected. This can happen if the confirmation is
          delayed — it should still complete shortly. If your plan doesn't update within a few minutes, please
          contact support with your payment receipt.
          <button
            type="button"
            onClick={() => {
              setActivationStatus("waiting");
              void Promise.all([refreshSubscription(), refreshProfile()]).then(([freshSub, freshProfile]) => {
                const active = freshProfile?.is_pro || freshProfile?.plan === "pro" || freshProfile?.plan === "business";
                const ready = Boolean(freshSub?.provider_subscription_id && freshSub?.provider_customer_id);
                setActivationStatus(active && ready ? "success" : "timeout");
              });
            }}
            className="ml-3 font-semibold underline underline-offset-2"
          >
            Check again
          </button>
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
              Upgrade securely, track invoice usage, apply active admin-managed offers, and manage billing history from one place.
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
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Monthly Limit</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{isUnlimited ? "Unlimited" : usage.baseLimit}</p>
          <p className="mt-1 text-sm text-slate-500">Invoices included in your plan</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Used This Month</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{invoicesThisMonth}</p>
          <p className="mt-1 text-sm text-slate-500">Invoices created this month</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Remaining</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{isUnlimited ? "∞" : usage.totalRemaining}</p>
          <p className="mt-1 text-sm text-slate-500">Invoices still available</p>
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
            <PlanCard key={id} plan={plans[id]} cycle={cycle} currentPlan={planId} onUpgrade={handleUpgrade} loading={checkoutLoading === id} offer={getOfferForPlanCycle(offers, id, cycle) ?? (appliedCode ? getOfferForPlanCycle(offers.filter(o => o.code === appliedCode), id, cycle) : undefined)} />
          ))}
        </div>
      </section>

      {planId !== "free" && (
        <section className="card p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Subscription actions</h2>
              <p className="mt-1 text-sm text-slate-500">Manage payment methods, receipts, invoices, and cancellation through secure Paddle billing tools.</p>
            </div>
            <div className={`rounded-full px-3 py-1 text-xs font-black ${subscription?.status === "active" ? "bg-emerald-100 text-emerald-700" : subscription?.status === "past_due" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
              {subscriptionLoading ? "Refreshing..." : (subscriptionReady ? (subscription?.status || "active") : "Awaiting Paddle sync").replace(/_/g, " ")}
            </div>
          </div>

          {subscription && (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Billing cycle</p><p className="mt-2 font-black capitalize text-slate-950">{subscription.billing_cycle || "—"}</p></div>
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Renews</p><p className="mt-2 font-black text-slate-950">{subscription.renews_at ? new Date(subscription.renews_at).toLocaleDateString("en-IN") : "—"}</p></div>
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Provider</p><p className="mt-2 font-black capitalize text-slate-950">{subscription.provider}</p></div>
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Subscription ID</p><p className="mt-2 truncate font-mono text-xs font-bold text-slate-700">{subscription.provider_subscription_id || "—"}</p></div>
            </div>
          )}

          {subscriptionMessage && <div className="mt-4 rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm font-medium text-primary-700">{subscriptionMessage}</div>}

          <div className="mt-5 flex flex-wrap gap-3">
            <button disabled={!subscriptionReady || subscriptionLoading} className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50" onClick={() => void openPortal("overview")}>Manage Subscription</button>
            <button disabled={!subscriptionReady || subscriptionLoading} className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50" onClick={() => void openPortal("payment_method")}>Update Payment Method</button>
            <button disabled={!subscriptionReady || subscriptionLoading} className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50" onClick={() => void openPortal("overview")}>View Receipts & Invoices</button>
            {subscription?.cancelled && subscription.status === "active" ? (
              <button disabled={subscriptionLoading} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50" onClick={() => setModal({ title: "Keep subscription active", message: "Remove the scheduled cancellation and continue renewing this subscription?", confirmLabel: "Keep active", onConfirm: () => void undoCancellation() })}>Keep Subscription</button>
            ) : (
              <button disabled={!subscriptionReady || subscriptionLoading} className="btn-danger disabled:cursor-not-allowed disabled:opacity-50" onClick={() => setModal({ title: "Cancel at period end", message: "Your subscription will remain active until the end of the current billing period. You can undo this before the effective date.", confirmLabel: "Schedule cancellation", variant: "danger", onConfirm: () => void requestCancellation() })}>Cancel Subscription</button>
            )}
          </div>
        </section>
      )}

      <section className="card">
        <div className="border-b border-slate-100 p-6">
          <h2 className="text-lg font-bold text-slate-950">Billing history</h2>
          <p className="mt-1 text-sm text-slate-500">Paddle transactions, renewals, and receipts linked to your account appear here.</p>
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
              {billingEvents.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-10 text-center text-sm text-slate-500">No Paddle billing events yet.</td></tr>
              ) : billingEvents.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 text-sm text-slate-700">{new Date(item.created_at).toLocaleDateString("en-IN")}</td>
                  <td className="px-6 py-4 text-sm font-mono text-slate-600">{item.order_id || item.provider_event_id}</td>
                  <td className="px-6 py-4 text-sm text-slate-700">{item.plan || "—"}</td>
                  <td className="px-6 py-4 text-sm font-bold text-slate-950">{item.amount === 0 ? "—" : `${item.currency || ""} ${Number(item.amount).toLocaleString("en-US")}`}</td>
                  <td className="px-6 py-4"><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">{item.status || item.event_name}</span></td>
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
