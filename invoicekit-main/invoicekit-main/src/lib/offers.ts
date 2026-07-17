import { supabase } from "./supabase";
import type { BillingCycle, Plan } from "./pricing";

export type OfferStatus = "active" | "scheduled" | "expired" | "disabled";

export type MarketingOffer = {
  id: string;
  code: string;
  label: string;
  description: string | null;
  badge_text: string | null;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  applies_to: Plan[];
  billing_scope: BillingCycle | "all";
  starts_at: string | null;
  expires_at: string | null;
  usage_limit: number | null;
  usage_count: number;
  active: boolean;
  featured: boolean;
  priority: number;
  paddle_discount_id: string | null;
  paddle_synced: boolean;
  created_at: string;
  updated_at: string;
};

export function getOfferStatus(offer: Pick<MarketingOffer, "active" | "starts_at" | "expires_at">, now = new Date()): OfferStatus {
  if (!offer.active) return "disabled";
  if (offer.starts_at && new Date(offer.starts_at) > now) return "scheduled";
  if (offer.expires_at && new Date(offer.expires_at) < now) return "expired";
  return "active";
}

export function isOfferApplicable(offer: MarketingOffer, plan: Plan, cycle: BillingCycle) {
  return (
    getOfferStatus(offer) === "active" &&
    offer.applies_to.includes(plan) &&
    (offer.billing_scope === "all" || offer.billing_scope === cycle) &&
    (!offer.usage_limit || offer.usage_count < offer.usage_limit)
  );
}

export function formatOfferDiscount(offer: MarketingOffer, currencySymbol = "$") {
  return offer.discount_type === "percentage"
    ? `${Number(offer.discount_value).toLocaleString("en-US")}% OFF`
    : `${currencySymbol}${Number(offer.discount_value).toLocaleString("en-US")} OFF`;
}

export async function fetchPublicOffers() {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("admin_promo_codes")
    .select("*")
    .eq("active", true)
    .or(`starts_at.is.null,starts_at.lte.${now}`)
    .or(`expires_at.is.null,expires_at.gte.${now}`)
    .order("featured", { ascending: false })
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as MarketingOffer[];
}
