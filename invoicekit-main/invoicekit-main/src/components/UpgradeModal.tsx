import { useMemo, useState } from "react";
import { useRegion } from "../context/RegionContext";
import { INDIA_PLANS, GLOBAL_PLANS } from "../lib/pricing";
import RivoxLogo from "./RivoxLogo";

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const FEATURES = [
  "High-volume professional invoicing",
  "PDFs with your own branding",
  "Client address book and reports",
  "Priority support",
  "Remove Rivox watermark",
];

export default function UpgradeModal({ isOpen, onClose }: UpgradeModalProps) {
  const region = useRegion();
  const plans = region === "india" ? INDIA_PLANS : GLOBAL_PLANS;
  const [subscribing, setSubscribing] = useState(false);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");

  const price = useMemo(
    () => billingCycle === "yearly" ? plans.pro.yearlyMonthlyPrice : plans.pro.monthlyPrice,
    [billingCycle, plans.pro.monthlyPrice, plans.pro.yearlyMonthlyPrice],
  );

  if (!isOpen) return null;

  function handleSubscribe() {
    setSubscribing(true);
    setTimeout(() => {
      setSubscribing(false);
      alert("Secure checkout will open when payment setup is completed.");
    }, 800);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-slate-950/65 backdrop-blur-md" onClick={onClose} aria-label="Close upgrade dialog" />
      <div className="relative w-full max-w-lg overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-[0_35px_90px_rgba(15,23,42,0.32)] animate-scale-in">
        <div className="absolute inset-x-0 top-0 h-36 bg-gradient-to-br from-primary-100 via-violet-100 to-cyan-100" />
        <button onClick={onClose} className="absolute right-5 top-5 z-10 rounded-full bg-white/80 p-2 text-slate-500 shadow-sm backdrop-blur transition hover:text-slate-950" aria-label="Close">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>

        <div className="relative px-7 pb-8 pt-8 sm:px-9">
          <div className="flex justify-center"><RivoxLogo showWordmark={false} iconClassName="w-14 h-14" /></div>
          <div className="mt-5 text-center">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-primary-700">Upgrade your workspace</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-slate-950">Rivox Pro</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">More capacity, premium branding, and the tools to run a growing business.</p>
          </div>

          <div className="mx-auto mt-6 flex w-fit rounded-xl bg-slate-100 p-1">
            {(["monthly", "yearly"] as const).map((cycle) => (
              <button key={cycle} onClick={() => setBillingCycle(cycle)} className={`rounded-lg px-4 py-2 text-sm font-bold capitalize transition ${billingCycle === cycle ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}>
                {cycle}{cycle === "yearly" && <span className="ml-2 text-[10px] text-emerald-600">SAVE</span>}
              </button>
            ))}
          </div>

          <div className="mt-6 text-center">
            <span className="align-top text-xl font-black text-slate-950">{plans.pro.symbol}</span>
            <span className="text-5xl font-black tracking-[-0.06em] text-slate-950">{price}</span>
            <span className="ml-1 text-sm font-semibold text-slate-500">/month</span>
            {billingCycle === "yearly" && <p className="mt-1 text-xs font-semibold text-slate-500">Billed yearly</p>}
          </div>

          <ul className="mt-7 space-y-3">
            {FEATURES.map((feature) => (
              <li key={feature} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                </span>
                <span className="text-sm font-medium text-slate-700">{feature}</span>
              </li>
            ))}
          </ul>

          <button onClick={handleSubscribe} disabled={subscribing} className="mt-7 w-full rounded-2xl bg-slate-950 px-5 py-3.5 text-base font-black text-white shadow-xl shadow-slate-950/20 transition hover:-translate-y-0.5 hover:bg-primary-600 disabled:translate-y-0">
            {subscribing ? "Preparing checkout..." : `Choose ${billingCycle === "yearly" ? "Yearly" : "Monthly"} Pro`}
          </button>
          <button onClick={onClose} className="mt-3 w-full py-2 text-sm font-semibold text-slate-500 transition hover:text-slate-800">Continue with Free</button>
        </div>
      </div>
    </div>
  );
}
