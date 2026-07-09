import { Link } from "react-router-dom";

const metrics = [
  { label: "Invoice creation", value: "60 sec" },
  { label: "Payment tracking", value: "Auto" },
  { label: "Global-ready", value: "Multi-currency" },
];

export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-[radial-gradient(circle_at_top_left,#dbeafe_0,transparent_36%),linear-gradient(180deg,#ffffff_0%,#f8fafc_58%,#ffffff_100%)]">
      <div className="absolute right-0 top-20 h-72 w-72 rounded-full bg-blue-200/40 blur-3xl" />
      <div className="absolute bottom-24 left-0 h-80 w-80 rounded-full bg-indigo-200/40 blur-3xl" />
      <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 py-20 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
        <div className="text-center lg:text-left">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Premium invoicing, client billing and payment operations
          </span>
          <h1 className="mt-8 text-5xl font-black tracking-tight text-slate-950 sm:text-6xl lg:text-7xl">
            Run your business.
            <span className="mt-2 block bg-gradient-to-r from-blue-700 via-indigo-600 to-slate-950 bg-clip-text text-transparent">Get paid faster.</span>
          </h1>
          <p className="mx-auto mt-7 max-w-2xl text-lg leading-8 text-slate-600 lg:mx-0">
            Create professional invoices, manage clients, track payments and build a clean billing workflow from one modern platform.
          </p>
          <div className="mt-9 flex flex-col justify-center gap-4 sm:flex-row lg:justify-start">
            <Link to="/signup" className="inline-flex items-center justify-center rounded-2xl bg-blue-700 px-7 py-4 text-base font-black text-white shadow-xl shadow-blue-700/25 transition hover:-translate-y-0.5 hover:bg-blue-800">Start Free</Link>
            <a href="#pricing" className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-7 py-4 text-base font-black text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:text-blue-700">Compare Plans</a>
            <Link to="/login" className="inline-flex items-center justify-center rounded-2xl px-7 py-4 text-base font-black text-slate-600 transition hover:bg-slate-100">Watch Demo</Link>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {metrics.map((item) => (
              <div key={item.label} className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur">
                <p className="text-xl font-black text-slate-950">{item.value}</p>
                <p className="mt-1 text-sm font-medium text-slate-500">{item.label}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-3 text-sm font-semibold text-slate-500 lg:justify-start">
            <span className="rounded-full bg-white px-3 py-1 shadow-sm">Secure auth</span>
            <span className="rounded-full bg-white px-3 py-1 shadow-sm">PDF export</span>
            <span className="rounded-full bg-white px-3 py-1 shadow-sm">Mobile friendly</span>
            <span className="rounded-full bg-white px-3 py-1 shadow-sm">Global invoicing</span>
          </div>
        </div>
        <div className="relative">
          <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-blue-600/20 via-indigo-500/10 to-slate-900/10 blur-2xl" />
          <div className="relative overflow-hidden rounded-[2rem] border border-white/70 bg-white shadow-2xl shadow-slate-900/10">
            <div className="flex h-12 items-center gap-2 border-b border-slate-200 bg-slate-50 px-5">
              <span className="h-3 w-3 rounded-full bg-red-400" /><span className="h-3 w-3 rounded-full bg-yellow-400" /><span className="h-3 w-3 rounded-full bg-green-400" />
              <div className="ml-4 rounded-full border border-slate-200 bg-white px-4 py-1 text-xs font-semibold text-slate-400">app.invoicekit.com</div>
            </div>
            <div className="grid lg:grid-cols-[210px_1fr]">
              <aside className="hidden bg-slate-950 p-5 text-white lg:block">
                <div className="text-lg font-black">InvoiceKit</div>
                <div className="mt-7 space-y-2 text-sm font-semibold text-slate-300">
                  {['Dashboard', 'Invoices', 'Clients', 'Billing', 'Reports'].map((item, index) => (
                    <div key={item} className={`rounded-xl px-3 py-2 ${index === 0 ? 'bg-white/10 text-white' : ''}`}>{item}</div>
                  ))}
                </div>
              </aside>
              <main className="bg-slate-50 p-5 sm:p-7">
                <div className="flex items-start justify-between gap-4">
                  <div><p className="text-sm font-bold text-slate-500">Business overview</p><h3 className="mt-1 text-2xl font-black text-slate-950">Today’s billing</h3></div>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">Live</span>
                </div>
                <div className="mt-6 grid gap-4 sm:grid-cols-3">
                  <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><p className="text-xs font-bold uppercase text-slate-400">Revenue</p><p className="mt-2 text-2xl font-black text-slate-950">$18,450</p><p className="mt-1 text-xs font-bold text-emerald-600">+14.2%</p></div>
                  <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><p className="text-xs font-bold uppercase text-slate-400">Invoices</p><p className="mt-2 text-2xl font-black text-slate-950">248</p><p className="mt-1 text-xs font-bold text-blue-600">32 pending</p></div>
                  <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><p className="text-xs font-bold uppercase text-slate-400">Paid</p><p className="mt-2 text-2xl font-black text-slate-950">96%</p><p className="mt-1 text-xs font-bold text-slate-500">Auto tracked</p></div>
                </div>
                <div className="mt-5 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                  <div className="flex items-center justify-between"><h4 className="font-black text-slate-900">Recent invoices</h4><span className="text-sm font-black text-blue-700">View all</span></div>
                  <div className="mt-4 space-y-3">
                    {[
                      ['INV-1001', 'Paid', '$1,280', 'text-emerald-700 bg-emerald-50'],
                      ['INV-1002', 'Pending', '$820', 'text-amber-700 bg-amber-50'],
                      ['INV-1003', 'Overdue', '$520', 'text-red-700 bg-red-50'],
                    ].map(([id, status, amount, cls]) => (
                      <div key={id} className="flex items-center justify-between rounded-xl border border-slate-100 p-3">
                        <div><p className="font-black text-slate-900">{id}</p><p className="text-xs text-slate-500">Acme Trading</p></div>
                        <div className="text-right"><p className="font-black text-slate-900">{amount}</p><span className={`rounded-full px-2 py-1 text-xs font-black ${cls}`}>{status}</span></div>
                      </div>
                    ))}
                  </div>
                </div>
              </main>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
