import type { ReactNode } from "react";
import Navbar from "../landing/Navbar";
import Footer from "../landing/Footer";

interface PublicPageLayoutProps {
  eyebrow: string;
  title: string;
  description: string;
  updated?: string;
  children: ReactNode;
}

export default function PublicPageLayout({ eyebrow, title, description, updated, children }: PublicPageLayoutProps) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <Navbar />
      <main>
        <section className="border-b border-slate-200 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.14),transparent_38%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]">
          <div className="mx-auto max-w-5xl px-5 py-16 sm:px-6 sm:py-20">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-primary-600">{eyebrow}</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-black tracking-[-0.045em] text-slate-950 sm:text-5xl">{title}</h1>
            <p className="mt-5 max-w-3xl text-base leading-8 text-slate-600 sm:text-lg">{description}</p>
            {updated && <p className="mt-6 text-sm font-semibold text-slate-500">Last updated: {updated}</p>}
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-5 py-12 sm:px-6 sm:py-16">
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-10">
            <div className="legal-content space-y-9 text-[15px] leading-7 text-slate-600">{children}</div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
