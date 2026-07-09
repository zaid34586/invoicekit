import { Link } from "react-router-dom";

function LogoMark({ className = "" }: { className?: string }) {
  return (
    <div className={`relative flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-slate-950 shadow-lg shadow-blue-600/25 ${className}`}>
      <div className="absolute inset-[1px] rounded-2xl border border-white/20" />
      <svg viewBox="0 0 32 32" className="h-6 w-6 text-white" fill="none" aria-hidden="true">
        <path d="M9 7.5h11.5a3 3 0 0 1 3 3v14L20 22H9a3 3 0 0 1-3-3V10.5a3 3 0 0 1 3-3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M11 13h9M11 17h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M22 5 11 20h7l-2 7 9-14h-7l4-8Z" fill="currentColor" />
      </svg>
    </div>
  );
}

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/85 backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-6">
        <Link to="/" className="flex items-center gap-3" aria-label="InvoiceKit home">
          <LogoMark />
          <div className="leading-tight">
            <span className="block text-2xl font-black tracking-tight text-slate-950">InvoiceKit</span>
            <span className="hidden text-xs font-semibold uppercase tracking-[0.22em] text-slate-400 sm:block">Business billing suite</span>
          </div>
        </Link>
        <nav className="hidden items-center rounded-full border border-slate-200 bg-white px-2 py-2 shadow-sm lg:flex">
          <a href="#features" className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-blue-700">Features</a>
          <a href="#pricing" className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-blue-700">Pricing</a>
          <a href="#faq" className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-blue-700">FAQ</a>
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link to="/login" className="hidden rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100 sm:inline-flex">Sign In</Link>
          <Link to="/signup" className="inline-flex items-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5 hover:bg-blue-700 sm:px-5">Start Free</Link>
        </div>
      </div>
    </header>
  );
}
