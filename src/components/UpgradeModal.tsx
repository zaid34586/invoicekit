import { useState } from "react";
import { useRegion } from "../context/RegionContext";
import { GLOBAL_PLANS, INDIA_PLANS, formatPlanPrice } from "../lib/pricing";

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const FEATURES = [
  "Unlimited invoices",
  "PDF with your branding",
  "Client address book",
  "Priority support",
  "Remove InvoiceKit watermark",
];

export default function UpgradeModal({ isOpen, onClose }: UpgradeModalProps) {
  const region = useRegion();

const plans =
  region === "india"
    ? INDIA_PLANS
    : GLOBAL_PLANS;
  const [subscribing, setSubscribing] = useState(false);

  if (!isOpen) return null;

  function handleSubscribe() {
    setSubscribing(true);
    setTimeout(() => {
      setSubscribing(false);
      alert(
        "Payment integration will be available soon."
      );
    }, 800);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative card max-w-md w-full p-8 animate-scale-in">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl mb-4 shadow-lg">
            <span className="text-2xl">⭐</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900">InvoiceKit Pro</h2>
          <p className="text-3xl font-bold text-primary-600 mt-2">
            {formatPlanPrice(plans.pro, "monthly")}
            <span className="text-base font-normal text-slate-500">/month</span>
          </p>
        </div>

        <ul className="space-y-3 mb-8">
          {FEATURES.map((feature) => (
            <li key={feature} className="flex items-center gap-3">
              <span className="flex-shrink-0 w-5 h-5 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-3 h-3 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </span>
              <span className="text-sm text-slate-700">{feature}</span>
            </li>
          ))}
        </ul>

        <button
          onClick={handleSubscribe}
          disabled={subscribing}
          className="btn-primary w-full text-base py-3"
        >
          {subscribing ? "Processing..." : "Subscribe Now"}
        </button>
        <button
          onClick={onClose}
          className="w-full text-center text-sm text-slate-500 hover:text-slate-700 mt-4 transition"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}
