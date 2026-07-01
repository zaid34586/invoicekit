import { Link } from "react-router-dom";

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">

        {/* Logo */}
        <Link to="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center">
            <span className="text-white font-bold text-lg">⚡</span>
          </div>

          <span className="text-2xl font-bold text-slate-900">
            InvoiceKit
          </span>
        </Link>

        {/* Navigation */}
        <nav className="hidden md:flex items-center gap-8">

          <a href="#features" className="text-slate-600 hover:text-primary-600 transition">
            Features
          </a>

          <a href="#pricing" className="text-slate-600 hover:text-primary-600 transition">
            Pricing
          </a>

          <a href="#faq" className="text-slate-600 hover:text-primary-600 transition">
            FAQ
          </a>

        </nav>

        {/* Buttons */}
        <div className="flex items-center gap-3">

          <Link
            to="/login"
            className="px-5 py-2 rounded-lg font-medium text-slate-700 hover:bg-slate-100 transition"
          >
            Sign In
          </Link>

          <Link
            to="/signup"
            className="px-5 py-2 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-700 transition"
          >
            Get Started
          </Link>

        </div>

      </div>
    </header>
  );
}