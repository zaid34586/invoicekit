export default function About() {
  return (
    <section id="about" className="relative overflow-hidden bg-white py-14 sm:py-20 lg:py-24">
      <div className="page-container">
        <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 px-6 py-14 shadow-[0_40px_100px_-30px_rgba(79,70,229,0.55)] sm:px-10 sm:py-16 lg:px-16 lg:py-20">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-violet-500/25 blur-3xl" />
          <div className="pointer-events-none absolute -left-24 bottom-0 h-72 w-72 rounded-full bg-cyan-400/15 blur-3xl" />

          <div className="relative mx-auto max-w-2xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-violet-300">Why Rivox</p>
            <h2 className="mt-4 text-2xl font-black leading-tight tracking-tight text-white sm:text-3xl lg:text-[2.5rem] lg:leading-[1.15]">
              Built for professionals billing internationally.
            </h2>
            <p className="mt-5 text-sm leading-7 text-indigo-100/80 sm:text-base sm:leading-8">
              Most invoicing tools assume every client pays in your currency, in your country, under your tax rules.
              Rivox is built for freelancers and agencies where that's rarely true.
            </p>
          </div>

          <div className="relative mx-auto mt-12 grid max-w-4xl gap-5 sm:grid-cols-3">
            {[
              { icon: "🌍", title: "Multi-currency invoicing", copy: "Bill in your client's currency, get paid in yours — converted automatically at live rates." },
              { icon: "🧾", title: "Multi-country tax handling", copy: "GST, VAT and sales tax formatted correctly for your client's country, automatically." },
              { icon: "📊", title: "A real operating workspace", copy: "Team roles, audit logs, API access and reporting for agencies running real operations." },
            ].map((f) => (
              <div key={f.title} className="rounded-2xl border border-white/10 bg-white/[0.06] p-6 backdrop-blur">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-lg">{f.icon}</div>
                <h3 className="mt-4 text-base font-bold text-white">{f.title}</h3>
                <p className="mt-2 text-sm leading-6 text-indigo-100/70">{f.copy}</p>
              </div>
            ))}
          </div>

          <div className="relative mx-auto mt-8 max-w-3xl rounded-2xl border border-white/10 bg-white/[0.06] p-6 text-center backdrop-blur sm:p-7">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-violet-300">Example</p>
            <p className="mt-3 text-sm leading-7 text-indigo-50 sm:text-base sm:leading-8">
              A freelancer in the United States invoices a client in South Korea. Rivox generates the invoice in Korean
              Won, converts it to US Dollars at the live exchange rate, and applies the correct tax formatting for
              both sides — automatically.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
