import { useEffect, useState } from "react";
import { loadActiveBanners, trackGrowthEvent, type GrowthBanner } from "../lib/growth";

type Props = { placement: GrowthBanner["placement"] };

const styles: Record<GrowthBanner["style"], string> = {
  info: "border-blue-200 bg-blue-50 text-blue-950",
  success: "border-emerald-200 bg-emerald-50 text-emerald-950",
  warning: "border-amber-200 bg-amber-50 text-amber-950",
  premium: "border-violet-300 bg-gradient-to-r from-violet-950 via-slate-950 to-indigo-950 text-white shadow-xl",
};

const DISMISS_KEY_PREFIX = "rivox_banner_dismissed_";

function getDismissKey(bannerId: string, placement: string) {
  return `${DISMISS_KEY_PREFIX}${bannerId}_${placement}`;
}

export default function DynamicGrowthBanner({ placement }: Props) {
  const [banner, setBanner] = useState<GrowthBanner | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    loadActiveBanners(placement).then((items) => {
      const first = items[0] ?? null;
      if (first) {
        const dismissKey = getDismissKey(first.id, placement);
        const dismissedAt = localStorage.getItem(dismissKey);
        if (dismissedAt) {
          const hoursSinceDismiss = (Date.now() - Number(dismissedAt)) / (1000 * 60 * 60);
          if (hoursSinceDismiss < 24) {
            setDismissed(true);
            return;
          }
        }
        setBanner(first);
        void trackGrowthEvent({ event: "banner_view", bannerId: first.id });
      }
    });
  }, [placement]);

  function handleDismiss() {
    if (banner) {
      const dismissKey = getDismissKey(banner.id, placement);
      localStorage.setItem(dismissKey, String(Date.now()));
    }
    setDismissed(true);
  }

  if (!banner || dismissed) return null;

  return (
    <div className={`mx-auto my-5 flex max-w-7xl flex-col gap-4 rounded-2xl border px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${styles[banner.style]}`}>
      <div className="flex items-start gap-3">
        {banner.badge_text && <span className="mt-0.5 shrink-0 rounded-full bg-white/90 px-3 py-1 text-xs font-black text-slate-950">{banner.badge_text}</span>}
        <div><p className="font-black">{banner.title}</p>{banner.message && <p className="mt-1 text-sm opacity-80">{banner.message}</p>}</div>
      </div>
      <div className="flex items-center gap-2">
        {banner.cta_text && banner.cta_url && <a href={banner.cta_url} onClick={() => void trackGrowthEvent({ event: "banner_click", bannerId: banner.id })} className="rounded-xl bg-white px-4 py-2 text-sm font-black text-slate-950 shadow-sm">{banner.cta_text}</a>}
        <button onClick={handleDismiss} className="rounded-lg px-2 py-1 text-lg opacity-60 hover:opacity-100" aria-label="Dismiss banner">×</button>
      </div>
    </div>
  );
}
