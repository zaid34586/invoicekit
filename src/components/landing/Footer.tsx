import { Link } from "react-router-dom";
import RivoxLogo from "../RivoxLogo";

const columns = [
  {
    title: "Product",
    items: [
      ["Features", "/#features"],
      ["Pricing", "/pricing"],
      ["FAQ", "/#faq"],
      ["Sign in", "/login"],
    ],
  },
  {
    title: "Company",
    items: [
      ["About", "/about"],
      ["Contact", "/contact"],
      ["Security", "/security"],
    ],
  },
  {
    title: "Legal",
    items: [
      ["Terms of Service", "/terms"],
      ["Privacy Policy", "/privacy"],
      ["Refund Policy", "/refund-policy"],
    ],
  },
];

export default function Footer() {
  return (
    <footer className="relative overflow-hidden bg-slate-950 text-white">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary-400 to-transparent" />
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-[1.35fr_repeat(3,1fr)]">
          <div>
            <RivoxLogo inverse />
            <p className="mt-5 max-w-sm text-sm leading-7 text-slate-400">
              A modern business workspace for invoices, clients, subscriptions, reports, and faster payments.
            </p>
            <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400" /> All systems operational
            </div>
          </div>

          {columns.map((column) => (
            <div key={column.title}>
              <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-300">{column.title}</h3>
              <ul className="mt-5 space-y-3">
                {column.items.map(([label, href]) => (
                  <li key={label}>
                    <Link to={href} className="text-sm font-medium text-slate-400 transition hover:text-white">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-white/10 pt-7 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Rivox. All rights reserved.</p>
          <p>Where business moves faster.</p>
        </div>
      </div>
    </footer>
  );
}
