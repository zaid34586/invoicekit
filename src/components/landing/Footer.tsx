import { Link } from "react-router-dom";

const columns = [
  { title: "Product", links: ["Features", "Pricing", "Invoices", "Payments"] },
  { title: "Company", links: ["About", "Contact", "Support", "Status"] },
  { title: "Resources", links: ["Help Center", "Guides", "FAQ", "Roadmap"] },
  { title: "Legal", links: ["Privacy Policy", "Terms of Service", "Refund Policy", "Cookie Policy"] },
];

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 via-indigo-500 to-white/20 shadow-lg shadow-blue-500/20">
        <svg viewBox="0 0 32 32" className="h-6 w-6 text-white" fill="none" aria-hidden="true">
          <path d="M9 7.5h11.5a3 3 0 0 1 3 3v14L20 22H9a3 3 0 0 1-3-3V10.5a3 3 0 0 1 3-3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M22 5 11 20h7l-2 7 9-14h-7l4-8Z" fill="currentColor" />
        </svg>
      </div>
      <div>
        <h2 className="text-2xl font-black tracking-tight text-white">InvoiceKit</h2>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Business billing suite</p>
      </div>
    </div>
  );
}

export default function Footer() {
  return (
    <footer className="bg-slate-950 py-16 text-white">
      <div className="mx-auto max-w-7xl px-5 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_2fr]">
          <div>
            <Logo />
            <p className="mt-5 max-w-sm text-sm leading-7 text-slate-400">
              Premium invoicing software for freelancers, startups and growing businesses that want clean billing, faster payments and better client management.
            </p>
            <div className="mt-6 flex gap-3">
              {['in', 'x', 'yt'].map((item) => (
                <span key={item} className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-xs font-black uppercase text-slate-300">{item}</span>
              ))}
            </div>
          </div>

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {columns.map((column) => (
              <div key={column.title}>
                <h3 className="font-black text-white">{column.title}</h3>
                <ul className="mt-4 space-y-3 text-sm font-semibold text-slate-400">
                  {column.links.map((link) => (
                    <li key={link}><a href="#" className="transition hover:text-white">{link}</a></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 md:flex-row">
          <p className="text-sm font-semibold text-slate-500">© 2026 InvoiceKit. All rights reserved.</p>
          <div className="flex gap-5 text-sm font-bold text-slate-400">
            <Link to="/login" className="hover:text-white">Sign In</Link>
            <Link to="/signup" className="hover:text-white">Start Free</Link>
            <a href="mailto:support@invoicekit.com" className="hover:text-white">support@invoicekit.com</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
