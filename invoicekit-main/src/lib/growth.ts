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
  // Fetch by the simple, unambiguous filters server-side (active + placement),
  // then apply the starts_at/ends_at window check in JS. This avoids any
  // ambiguity from chaining two separate .or() date-range filters and makes
  // the "is this banner live right now" check impossible to get wrong.
  const { data, error } = await supabase
    .from("growth_banners")
    .select("*")
    .eq("active", true)
    .eq("placement", placement)
    .order("priority", { ascending: false });
  if (error) {
    console.warn("Unable to load growth banner:", error.message);
    return [] as GrowthBanner[];
  }
  const now = Date.now();
  const live = (data ?? []).filter((banner) => {
    const startsOk = !banner.starts_at || new Date(banner.starts_at).getTime() <= now;
    const endsOk = !banner.ends_at || new Date(banner.ends_at).getTime() >= now;
    return startsOk && endsOk;
  });
  return live.slice(0, 1) as GrowthBanner[];
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
