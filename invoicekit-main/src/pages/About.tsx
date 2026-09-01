import PublicPageLayout from "../components/public/PublicPageLayout";

export default function About() {
  return (
    <PublicPageLayout eyebrow="Company" title="Built for professionals billing internationally." description="Most invoicing tools assume every client pays in your currency, in your country, under your tax rules. Rivox is built for freelancers and agencies where that's rarely true.">
      <section><h2 className="text-2xl font-black text-slate-950">Why Rivox exists</h2><p className="mt-3">Growing freelancers and agencies often manage invoices, clients, payments, currencies, and team updates across disconnected tools that were never built for cross-border work. Rivox brings invoicing, clients, reporting, subscriptions, and team workflows into one focused workspace designed specifically for businesses operating internationally.</p></section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { icon: "🌍", title: "Multi-currency invoicing", text: "Bill in your client's currency, get paid in yours — converted automatically at live rates." },
          { icon: "🧾", title: "Multi-country tax handling", text: "GST, VAT and sales tax formatted correctly for your client's country, automatically." },
          { icon: "📊", title: "A real operating workspace", text: "Team roles, audit logs, API access and reporting for agencies running real operations." },
        ].map((f) => (
          <div key={f.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-lg shadow-sm">{f.icon}</div>
            <h3 className="mt-4 font-black text-slate-950">{f.title}</h3>
            <p className="mt-2 text-sm">{f.text}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center sm:p-7">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary-700">Example</p>
        <p className="mt-3 text-sm leading-7 text-slate-700 sm:text-base sm:leading-8">
          A freelancer in the United States invoices a client in South Korea. Rivox generates the invoice in Korean
          Won, converts it to US Dollars at the live exchange rate, and applies the correct tax formatting for both
          sides — automatically.
        </p>
      </section>

      <section><h2 className="text-2xl font-black text-slate-950">Built for international teams</h2><p className="mt-3">Rivox supports modern businesses that work across borders, currencies, clients, and time zones. Our goal is to provide clear workflows, useful reporting, and payment-ready operations without unnecessary complexity.</p></section>

      <section className="grid gap-4 sm:grid-cols-3">{[["Clarity","See the work and numbers that matter."],["Control","Keep business information organized and secure."],["Momentum","Move from invoice to payment with less friction."]].map(([title,text])=><div key={title} className="rounded-2xl border border-slate-200 bg-slate-50 p-5"><h3 className="font-black text-slate-950">{title}</h3><p className="mt-2 text-sm">{text}</p></div>)}</section>
    </PublicPageLayout>
  );
}
