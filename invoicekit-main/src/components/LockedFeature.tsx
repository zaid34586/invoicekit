import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

interface LockedFeatureProps {
  /** true = show the blurred preview + upgrade overlay. false = render children normally. */
  active: boolean;
  /** Small eyebrow label, e.g. "Pro feature" or "Business feature" */
  eyebrow?: string;
  title: string;
  description: string;
  children: ReactNode;
}

/**
 * Wraps a real, already-built page/section and shows it as a blurred
 * "locked preview" with an upgrade CTA on top when `active` is true.
 *
 * This is the pattern used across the app (see Settings > Payment Gateway)
 * for Free/Pro users looking at Business-only functionality: they SEE the
 * real feature (so they understand the value), but can't interact with it
 * until they upgrade.
 */
export default function LockedFeature({ active, eyebrow = "Business feature", title, description, children }: LockedFeatureProps) {
  const navigate = useNavigate();

  if (!active) return <>{children}</>;

  return (
    <div className="relative">
      <div aria-hidden="true" className="pointer-events-none select-none blur-[6px] opacity-50">
        {children}
      </div>
      {/* Fixed (not absolute) so the card is centered in the viewport the
          instant this renders -- the content behind it can be much taller
          than the screen, and an absolutely-positioned overlay would center
          itself against that full height, forcing the user to scroll down
          to find it. */}
      <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white/95 p-6 text-center shadow-[0_30px_80px_-20px_rgba(15,23,42,0.35)] backdrop-blur">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-primary-700">{eyebrow}</p>
          <h3 className="mt-2 text-lg font-black text-slate-950">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
          <button
            onClick={() => navigate("/billing")}
            className="mt-4 w-full rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-primary-600"
          >
            See what unlocks
          </button>
        </div>
      </div>
    </div>
  );
}
