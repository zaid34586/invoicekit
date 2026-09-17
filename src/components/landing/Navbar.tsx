import { Link } from "react-router-dom";
import { useState } from "react";
import RivoxLogo from "../RivoxLogo";

const navigation = [
  ["Features", "/#features"],
  ["How it works", "/#how-it-works"],
  ["Pricing", "/pricing"],
  ["FAQ", "/#faq"],
] as const;

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/90 backdrop-blur-xl">
      <div className="page-container flex h-16 items-center justify-between sm:h-[72px]">
        <Link to="/" aria-label="Rivox home" className="rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2">
          <RivoxLogo />
        </Link>

        <nav className="hidden items-center gap-1 rounded-full border border-slate-200/80 bg-white/80 p-1 shadow-sm md:flex" aria-label="Primary navigation">
          {navigation.map(([label, href]) => (
            <Link
              key={label}
              to={href}
              className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link to="/login" className="hidden rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 sm:inline-flex">
            Sign in
          </Link>
          <Link to="/signup" className="inline-flex min-h-10 items-center rounded-xl bg-slate-950 px-3.5 py-2 text-sm font-bold sm:px-4 sm:py-2.5 text-white shadow-lg shadow-slate-950/15 transition hover:-translate-y-0.5 hover:bg-primary-600">
            Start free
            <span className="ml-2 hidden sm:inline" aria-hidden="true">→</span>
          </Link>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="ml-2 rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
            aria-label="Toggle menu"
          >
            {mobileOpen ? (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-slate-200 bg-white md:hidden">
          <nav className="page-container flex flex-col gap-1 py-4" aria-label="Mobile navigation">
            {navigation.map(([label, href]) => (
              <Link
                key={label}
                to={href}
                onClick={() => setMobileOpen(false)}
                className="rounded-xl px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
              >
                {label}
              </Link>
            ))}
            <Link
              to="/login"
              onClick={() => setMobileOpen(false)}
              className="rounded-xl px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
            >
              Sign in
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
