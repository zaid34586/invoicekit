export default function SocialProof() {
  const stats = [
    { value: "40+", label: "Countries Supported" },
    { value: "160+", label: "Currencies" },
    { value: "24/7", label: "Cloud Access" },
    { value: "Free", label: "Plan Available" },
  ];

  return (
    <section className="border-y border-slate-200 bg-white py-12 sm:py-16">
      <div className="mx-auto max-w-5xl px-5 sm:px-6">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                {stat.value}
              </p>
              <p className="mt-2 text-sm font-medium text-slate-500">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-10 text-center">
          <p className="text-sm text-slate-500">
            Trusted by freelancers, agencies, and businesses across the globe
          </p>
        </div>
      </div>
    </section>
  );
}
