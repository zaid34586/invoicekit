import { supabase } from "./supabase";

export type GrowthCampaign = {
  id: string;
  name: string;
  description: string | null;
  status: "draft" | "scheduled" | "active" | "paused" | "completed";
  starts_at: string | null;
  ends_at: string | null;
  offer_ids: string[];
  created_at: string;
  updated_at: string;
};

export type GrowthBanner = {
  id: string;
  title: string;
  message: string | null;
  badge_text: string | null;
  cta_text: string | null;
  cta_url: string | null;
  placement: "landing" | "pricing" | "billing" | "dashboard";
  style: "info" | "success" | "warning" | "premium";
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  priority: number;
  created_at: string;
  updated_at: string;
};

export type GrowthEventName = "offer_view" | "offer_click" | "checkout_start" | "checkout_success" | "banner_view" | "banner_click";

export async function loadActiveBanners(placement: GrowthBanner["placement"]) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("growth_banners")
    .select("*")
    .eq("active", true)
    .eq("placement", placement)
    .or(`starts_at.is.null,starts_at.lte.${now}`)
    .or(`ends_at.is.null,ends_at.gte.${now}`)
    .order("priority", { ascending: false })
    .limit(1);
  if (error) {
    console.warn("Unable to load growth banner:", error.message);
    return [] as GrowthBanner[];
  }
  return (data ?? []) as GrowthBanner[];
}

export async function trackGrowthEvent(input: {
  event: GrowthEventName;
  offerId?: string | null;
  bannerId?: string | null;
  plan?: string | null;
  billingCycle?: string | null;
  amount?: number | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    await supabase.from("growth_events").insert({
      event_name: input.event,
      offer_id: input.offerId ?? null,
      banner_id: input.bannerId ?? null,
      plan: input.plan ?? null,
      billing_cycle: input.billingCycle ?? null,
      amount: input.amount ?? null,
      metadata: input.metadata ?? {},
      page_path: window.location.pathname,
      referrer: document.referrer || null,
      user_agent: navigator.userAgent,
    });
  } catch (error) {
    console.warn("Growth analytics event failed:", error);
  }
}
