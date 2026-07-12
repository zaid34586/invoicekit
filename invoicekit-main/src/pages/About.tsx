import PublicPageLayout from "../components/public/PublicPageLayout";

export default function About() {
  return (
    <PublicPageLayout eyebrow="Company" title="Business operations, without the busywork." description="Rivox brings invoicing, clients, reporting, subscriptions, and team workflows into one focused workspace.">
      <section><h2 className="text-2xl font-black text-slate-950">Why Rivox exists</h2><p className="mt-3">Growing businesses often manage invoices, clients, payments, spreadsheets, and team updates across disconnected tools. Rivox is designed to reduce that fragmentation and make essential business work faster and easier to understand.</p></section>
      <section><h2 className="text-2xl font-black text-slate-950">Built for international teams</h2><p className="mt-3">Rivox supports modern businesses that work across borders, currencies, clients, and time zones. Our goal is to provide clear workflows, useful reporting, and payment-ready operations without unnecessary complexity.</p></section>
      <section className="grid gap-4 sm:grid-cols-3">{[["Clarity","See the work and numbers that matter."],["Control","Keep business information organized and secure."],["Momentum","Move from invoice to payment with less friction."]].map(([title,text])=><div key={title} className="rounded-2xl border border-slate-200 bg-slate-50 p-5"><h3 className="font-black text-slate-950">{title}</h3><p className="mt-2 text-sm">{text}</p></div>)}</section>
    </PublicPageLayout>
  );
}
