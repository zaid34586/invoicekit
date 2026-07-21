export default function Features() {
  const features = [
    {
      title: "Professional Invoices",
      description: "Create clean, modern invoices in seconds."
    },
    {
      title: "PDF Export",
      description: "Download beautiful PDF invoices instantly."
    },
    {
      title: "Client Management",
      description: "Store and manage all your clients in one place."
    },
    {
      title: "GST Ready",
      description: "Automatic GST calculation with CGST, SGST & IGST."
    },
    {
      title: "Invoice Tracking",
      description: "Track Draft, Sent, Paid and Overdue invoices."
    },
    {
      title: "Share Anywhere",
      description: "Send invoices through Email, WhatsApp and Share Links."
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
            Powerful tools designed for freelancers, startups and businesses.
          </p>

        </div>

        <div className="mt-9 grid gap-4 sm:mt-12 sm:grid-cols-2 sm:gap-6 lg:mt-16 lg:grid-cols-3 lg:gap-8">

          {features.map((item) => (

            <div
              key={item.title}
              className="rounded-2xl border border-slate-200 p-5 transition hover:shadow-xl sm:p-7 lg:p-8"
            >
              <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center text-2xl mb-6">
                ⚡
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