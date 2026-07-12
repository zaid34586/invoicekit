import PublicPageLayout from "../components/public/PublicPageLayout";

export default function Contact() {
  return (
    <PublicPageLayout eyebrow="Support" title="Talk to the Rivox team" description="Questions about Rivox, billing, privacy, or your account? Use the contact details below and include enough context for us to help quickly.">
      <div className="grid gap-5 md:grid-cols-2">
        <a href="mailto:support@rivox.com" className="rounded-2xl border border-slate-200 bg-slate-50 p-6 transition hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-lg"><p className="text-xs font-black uppercase tracking-[0.16em] text-primary-600">Email support</p><h2 className="mt-3 text-xl font-black text-slate-950">support@rivox.com</h2><p className="mt-2 text-sm">For product, account, billing, privacy, and refund questions.</p></a>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6"><p className="text-xs font-black uppercase tracking-[0.16em] text-primary-600">Response information</p><h2 className="mt-3 text-xl font-black text-slate-950">Include useful details</h2><p className="mt-2 text-sm">Share your account email, invoice or order reference, and a short description. Never email passwords or full card details.</p></div>
      </div>
    </PublicPageLayout>
  );
}
