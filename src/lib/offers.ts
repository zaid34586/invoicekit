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
    .select("id,code,label,discount_type,discount_value,applies_to,billing_scope,starts_at,expires_at,active,paddle_discount_id,paddle_synced")
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
    }))
    .sort((a, b) => b.discountValue - a.discountValue);
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
