import { useEffect } from "react";
import Navbar from "../components/landing/Navbar";
import Pricing from "../components/landing/Pricing";
import FAQ from "../components/landing/FAQ";
import Footer from "../components/landing/Footer";

export default function PricingPage() {
  useEffect(() => {
    document.title = "Pricing | Rivox";
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main>
        <section className="border-b border-slate-200 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.16),transparent_42%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]">
          <div className="mx-auto max-w-5xl px-5 py-14 text-center sm:px-6 sm:py-20">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-primary-600">Simple pricing</p>
            <h1 className="mt-4 text-4xl font-black tracking-[-0.045em] text-slate-950 sm:text-6xl">Choose the plan that fits your business.</h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
              Start free, then upgrade when you need more invoices, advanced reporting, automation, and team features.
            </p>
          </div>
        </section>
        <Pricing />
        <FAQ />
      </main>
      <Footer />
    </div>
  );
}
