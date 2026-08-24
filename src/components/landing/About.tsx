export default function About() {
  return (
    <section id="about" className="scroll-mt-20 bg-slate-950 py-16 sm:py-20 lg:py-24">
      <div className="page-container">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-300">Why Rivox</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
            Built for professionals billing internationally — not another basic invoicing tool.
          </h2>
          <p className="mt-5 text-base leading-7 text-slate-300 sm:text-lg sm:leading-8">
            Most invoicing tools assume every client pays in your currency, in your country, under your tax rules.
            Rivox is built for freelancers and agencies where that's rarely true — clients spread across countries,
            currencies, and tax systems, and every invoice needs to be right the first time.
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-5xl gap-6 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <p className="text-2xl">🌍</p>
            <h3 className="mt-4 text-lg font-bold text-white">Multi-currency invoicing</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Bill a client in their currency and get paid in yours — the conversion happens automatically, at live market rates.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <p className="text-2xl">🧾</p>
            <h3 className="mt-4 text-lg font-bold text-white">Multi-country tax handling</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              GST, VAT, and sales tax are formatted correctly for your client's country automatically — no manual lookups.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <p className="text-2xl">📊</p>
            <h3 className="mt-4 text-lg font-bold text-white">A real operating workspace</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Team roles, audit logs, API access and reporting — for agencies running real, multi-person operations.
            </p>
          </div>
        </div>

        <div className="mx-auto mt-10 max-w-3xl rounded-2xl border border-white/10 bg-white/5 p-6 text-center sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-violet-300">Example</p>
          <p className="mt-3 text-base leading-7 text-slate-200 sm:text-lg">
            A freelancer in the United States invoices a client in South Korea. Rivox generates the invoice in Korean
            Won, converts it to US Dollars at the live exchange rate, and applies the correct tax formatting for both
            sides automatically — no spreadsheets, no manual conversion.
          </p>
        </div>
      </div>
    </section>
  );
}
