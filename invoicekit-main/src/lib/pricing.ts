export type Plan = "free" | "pro" | "business";
export type BillingCycle = "monthly" | "yearly";
export type CurrencyCode = "INR" | "USD";

export interface PricingPlan {
  id: Plan;
  name: string;
  tagline: string;
  description: string;
  monthlyPrice: number;
  yearlyMonthlyPrice: number;
  currency: CurrencyCode;
  symbol: "₹" | "$";
  invoiceLimit: number | "unlimited";
  clientLimit: number | "unlimited";
  teamMembers: number | "unlimited";
  featured?: boolean;
  cta: string;
  features: string[];
  limitations?: string[];
}

export const INDIA_PLANS: Record<Plan, PricingPlan> = {
  free: {
    id: "free",
    name: "Free",
    tagline: "Start simple",
    description: "For testing Rivox and creating your first invoices.",
    monthlyPrice: 0,
    yearlyMonthlyPrice: 0,
    currency: "INR",
    symbol: "₹",
    invoiceLimit: 3,
    clientLimit: 10,
    teamMembers: 0,
    cta: "Start Free",
    features: ["3 invoices/month", "PDF download", "Basic client management", "Rivox watermark"],
    limitations: ["No payment links", "No team access"],
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "For growing businesses",
    description: "Powerful billing, reports, and payment-ready invoicing for small teams.",
    monthlyPrice: 12499,
    yearlyMonthlyPrice: 12499,
    currency: "INR",
    symbol: "₹",
    invoiceLimit: 500,
    clientLimit: 500,
    teamMembers: 3,
    featured: true,
    cta: "Upgrade to Pro",
    features: [
      "500 invoices/month",
      "Remove Rivox watermark",
      "Payment-ready invoice links",
      "Email & WhatsApp sharing",
      "Reports and client insights",
      "Priority support",
    ],
  },
  business: {
    id: "business",
    name: "Business",
    tagline: "For serious operations",
    description: "Advanced controls, team workflows, API-ready billing, and brand control.",
    monthlyPrice: 20999,
    yearlyMonthlyPrice: 20999,
    currency: "INR",
    symbol: "₹",
    invoiceLimit: "unlimited",
    clientLimit: "unlimited",
    teamMembers: "unlimited",
    cta: "Choose Business",
    features: [
      "Unlimited invoices",
      "Unlimited clients",
      "Team members and roles",
      "Custom branding",
      "Advanced analytics",
      "API access and webhooks",
      "Audit logs",
      "Dedicated support",
    ],
  },
};

export const GLOBAL_PLANS: Record<Plan, PricingPlan> = {
  free: {
    ...INDIA_PLANS.free,
    currency: "USD",
    symbol: "$",
    monthlyPrice: 0,
    yearlyMonthlyPrice: 0,
  },
  pro: {
    ...INDIA_PLANS.pro,
    currency: "USD",
    symbol: "$",
    monthlyPrice: 150,
    yearlyMonthlyPrice: 150,
  },
  business: {
    ...INDIA_PLANS.business,
    currency: "USD",
    symbol: "$",
    monthlyPrice: 250,
    yearlyMonthlyPrice: 250,
  },
};

export function getPlanPrice(plan: PricingPlan, cycle: BillingCycle) {
  return cycle === "yearly" ? plan.yearlyMonthlyPrice : plan.monthlyPrice;
}

export function getAnnualTotal(plan: PricingPlan) {
  return plan.yearlyMonthlyPrice * 12;
}

export function formatPlanPrice(plan: PricingPlan, cycle: BillingCycle) {
  const price = getPlanPrice(plan, cycle);
  if (price === 0) return "Free";
  return `${plan.symbol}${price.toLocaleString("en-US")}`;
}

export function getPlanLimitLabel(limit: number | "unlimited", noun: string) {
  return limit === "unlimited" ? `Unlimited ${noun}` : `${limit.toLocaleString("en-US")} ${noun}`;
}
