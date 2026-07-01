export type Plan = "free" | "pro" | "business";

export interface PricingPlan {
  id: Plan;
  name: string;
  price: number;
  currency: "INR" | "USD";
  symbol: "₹" | "$";
  interval: "month";
}

export const INDIA_PLANS: Record<Plan, PricingPlan> = {
  free: {
    id: "free",
    name: "Free",
    price: 0,
    currency: "INR",
    symbol: "₹",
    interval: "month",
  },

  pro: {
    id: "pro",
    name: "Pro",
    price: 399,
    currency: "INR",
    symbol: "₹",
    interval: "month",
  },

  business: {
    id: "business",
    name: "Business",
    price: 999,
    currency: "INR",
    symbol: "₹",
    interval: "month",
  },
};

export const GLOBAL_PLANS: Record<Plan, PricingPlan> = {
  free: {
    id: "free",
    name: "Free",
    price: 0,
    currency: "USD",
    symbol: "$",
    interval: "month",
  },

  pro: {
    id: "pro",
    name: "Pro",
    price: 25,
    currency: "USD",
    symbol: "$",
    interval: "month",
  },

  business: {
    id: "business",
    name: "Business",
    price: 39,
    currency: "USD",
    symbol: "$",
    interval: "month",
  },
};