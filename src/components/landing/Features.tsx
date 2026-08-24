export default function Features() {
  const features = [
    {
      icon: "🌍",
      title: "Multi-Currency Invoicing",
      description: "Bill clients in their currency, get paid in yours — no manual math."
    },
    {
      icon: "📈",
      title: "Live Exchange Rates",
      description: "Every foreign-currency invoice is converted automatically at real-time market rates."
    },
    {
      icon: "🧾",
      title: "Global Tax Automation",
      description: "Automatic tax formatting for the US, UK, EU, India, UAE and more — GST, VAT, sales tax, handled for you."
    },
    {
      icon: "👥",
      title: "Team Workspace",
      description: "Invite your team into one shared workspace with roles and access controls."
    },
    {
      icon: "🎨",
      title: "Custom Brand Studio",
      description: "Your logo, colors and templates on every invoice, quote and client link."
    },
    {
      icon: "🔗",
      title: "API & Webhooks",
      description: "Connect Rivox to your own tools with a full API and real-time webhook events."
    }
  ];

  return (
    <section
      id="features"
      className="scroll-mt-20 bg-white section-shell"
    >
      <div className="page-container">

        <div className="text-center">

          <h2 className="text-4xl font-bold text-slate-900">
            Everything you need to manage invoices
          </h2>

          <p className="mt-4 text-slate-600 max-w-2xl mx-auto">
            Built for freelancers and agencies billing international clients — not another basic invoicing tool.
          </p>

        </div>

        <div className="mt-9 grid gap-4 sm:mt-12 sm:grid-cols-2 sm:gap-6 lg:mt-16 lg:grid-cols-3 lg:gap-8">

          {features.map((item) => (

            <div
              key={item.title}
              className="rounded-2xl border border-slate-200 p-5 transition hover:shadow-xl sm:p-7 lg:p-8"
            >
              <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center text-2xl mb-6">
                {item.icon}
              </div>

              <h3 className="text-xl font-semibold">
                {item.title}
              </h3>

              <p className="mt-3 text-slate-600">
                {item.description}
              </p>

            </div>

          ))}

        </div>

      </div>
    </section>
  );
}