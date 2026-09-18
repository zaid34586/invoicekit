import { Link } from "react-router-dom";

const ADS = [
  {
    title: "Upgrade to Pro",
    description: "Remove ads, get payment links, recurring invoices & more.",
    gradient: "from-violet-600 to-indigo-600",
  },
  {
    title: "Go Ad-Free with Pro",
    description: "500 invoices/month, client portal, multi-currency — ₹12,499/mo.",
    gradient: "from-emerald-600 to-teal-600",
  },
  {
    title: "Tired of Ads?",
    description: "Pro plan = ad-free experience + unlimited AI drafts.",
    gradient: "from-amber-500 to-orange-500",
  },
];

export default function AdBanner() {
  const ad = ADS[Math.floor(Math.random() * ADS.length)];

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-r ${ad.gradient} p-4 text-white shadow-lg`}>
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
      <div className="pointer-events-none absolute -left-4 bottom-0 h-16 w-16 rounded-full bg-white/5 blur-xl" />

      <div className="relative flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full">
              AD
            </span>
            <p className="text-sm font-bold">{ad.title}</p>
          </div>
          <p className="text-xs text-white/80 truncate">{ad.description}</p>
        </div>
        <Link
          to="/billing"
          className="shrink-0 rounded-xl bg-white px-4 py-2 text-xs font-bold text-slate-900 shadow-md transition hover:-translate-y-0.5 hover:shadow-lg"
        >
          Upgrade
        </Link>
      </div>
    </div>
  );
}
