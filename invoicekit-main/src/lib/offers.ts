import { supabase } from "./supabase";
import type { BillingCycle, Plan } from "./pricing";

export type MarketingOffer = {
  id: string;
  code: string;
  label: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  appliesTo: Plan[];
  billingScope: BillingCycle | "all";
  startsAt: string | null;
  expiresAt: string | null;
  active: boolean;
  paddleDiscountId: string | null;
  paddleSynced: boolean;
  newUsersOnly: boolean;
};

type PromoRow = {
  id: string;
  code: string;
  label: string;
  discount_type: "percentage" | "fixed";
  discount_value: number | string;
  applies_to: string[] | null;
  billing_scope: BillingCycle | "all";
  starts_at: string | null;
  expires_at: string | null;
  active: boolean;
  paddle_discount_id: string | null;
  paddle_synced: boolean;
  new_users_only: boolean;
};

function isCurrentlyActive(row: PromoRow, now = new Date()) {
  if (!row.active) return false;
  if (row.starts_at && new Date(row.starts_at) > now) return false;
  if (row.expires_at && new Date(row.expires_at) < now) return false;
  return true;
}

export async function loadActiveMarketingOffers(): Promise<MarketingOffer[]> {
  const { data, error } = await supabase
    .from("admin_promo_codes")
    .select("id,code,label,discount_type,discount_value,applies_to,billing_scope,starts_at,expires_at,active,paddle_discount_id,paddle_synced,new_users_only")
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("Unable to load Rivox offers:", error.message);
    return [];
  }

  return ((data ?? []) as PromoRow[])
    .filter((row) => isCurrentlyActive(row))
    .map((row) => ({
      id: row.id,
      code: row.code,
      label: row.label,
      discountType: row.discount_type,
      discountValue: Number(row.discount_value),
      appliesTo: (row.applies_to ?? []).filter((plan): plan is Plan => ["free", "pro", "business"].includes(plan)),
      billingScope: row.billing_scope,
      startsAt: row.starts_at,
      expiresAt: row.expires_at,
      active: row.active,
      paddleDiscountId: row.paddle_discount_id,
      paddleSynced: row.paddle_synced,
      newUsersOnly: row.new_users_only,
    }))
    .sort((a, b) => b.discountValue - a.discountValue);
}

// Drops offers the current visitor is not actually eligible to redeem:
// - a "new users only" offer, when this account has held a paid plan before
// - any offer this user has already redeemed once (one-time-per-user)
// Signed-out visitors keep seeing "new users only" deals as marketing (they
// aren't eligible to check out anyway until they sign up), but never see an
// offer they (as this browser's signed-in user) already redeemed.
export async function filterOffersForUser(offers: MarketingOffer[], userId?: string): Promise<MarketingOffer[]> {
  if (offers.length === 0) return offers;
  if (!userId) return offers;

  const [{ data: profile }, { data: redemptions }] = await Promise.all([
    supabase.from("profiles").select("has_ever_subscribed").or(`user_id.eq.${userId},id.eq.${userId}`).maybeSingle(),
    supabase.from("admin_offer_redemptions").select("offer_id").eq("user_id", userId),
  ]);

  const hasEverSubscribed = Boolean((profile as { has_ever_subscribed?: boolean } | null)?.has_ever_subscribed);
  const redeemedIds = new Set(((redemptions ?? []) as Array<{ offer_id: string }>).map((r) => r.offer_id));

  return offers.filter((offer) => {
    if (offer.newUsersOnly && hasEverSubscribed) return false;
    if (redeemedIds.has(offer.id)) return false;
    return true;
  });
}

export function getOfferForPlanCycle(offers: MarketingOffer[], plan: Plan, cycle: BillingCycle) {
  return offers.find(
    (offer) =>
      offer.appliesTo.includes(plan) &&
      (offer.billingScope === "all" || offer.billingScope === cycle),
  );
}

export function formatOfferDiscount(offer: MarketingOffer) {
  return offer.discountType === "percentage"
    ? `${offer.discountValue}% OFF`
    : `${offer.discountValue.toLocaleString("en-US")} OFF`;
}
