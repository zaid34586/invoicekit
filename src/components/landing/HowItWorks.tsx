export default function HowItWorks() {
  const steps = [
    {
      number: "01",
      title: "Create Your Business",
      description: "Set up your business profile in less than a minute."
    },
    {
      number: "02",
      title: "Add Your Client",
      description: "Save client details once and reuse them anytime."
    },
    {
      number: "03",
      title: "Generate Invoice",
      description: "Create professional invoices with GST, PDF and sharing."
    }
  ];

  return (
    <section className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-6">

        <div className="text-center">
          <h2 className="text-4xl font-bold text-slate-900">
            How InvoiceKit Works
          </h2>

          <p className="mt-4 text-slate-600">
            Create and send invoices in just three simple steps.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mt-16">

          {steps.map((step) => (
            <div
              key={step.number}
              className="rounded-2xl border border-slate-200 p-8 text-center hover:shadow-xl transition"
            >
              <div className="w-16 h-16 rounded-full bg-primary-600 text-white flex items-center justify-center text-2xl font-bold mx-auto">
                {step.number}
              </div>

              <h3 className="mt-6 text-2xl font-semibold">
                {step.title}
              </h3>

              <p className="mt-4 text-slate-600">
                {step.description}
              </p>
            </div>
          ))}

        </div>

      </div>
    </section>
  );
}