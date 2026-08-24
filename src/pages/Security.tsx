import PublicPageLayout from "../components/public/PublicPageLayout";

export default function Security() {
  return (
    <PublicPageLayout eyebrow="Trust" title="Security at Rivox" description="Security is part of how Rivox is designed, operated, and improved.">
      <section className="grid gap-4 sm:grid-cols-2">{[
        ["Secure authentication","Account access is protected through managed authentication, session controls, and verification workflows."],
        ["Encrypted transport","Connections use HTTPS/TLS to protect information while it travels between your browser and Rivox."],
        ["Access controls","Application and database access are restricted according to roles and operational need."],
        ["Payment separation","Full payment card details are handled by the Merchant of Record and are not stored by Rivox."],
        ["Monitoring and review","We use logs, diagnostics, and operational review to investigate errors and suspicious activity."],
        ["Shared responsibility","Users should use strong credentials, protect devices, review team access, and report suspicious activity promptly."],
      ].map(([title,text])=><div key={title} className="rounded-2xl border border-slate-200 bg-slate-50 p-5"><h2 className="font-black text-slate-950">{title}</h2><p className="mt-2 text-sm">{text}</p></div>)}</section>
      <section><h2 className="text-xl font-black text-slate-950">Report a security concern</h2><p className="mt-3">Send a clear description to <a className="font-bold text-primary-600 hover:underline" href="mailto:support@rivoxcloud.com">support@rivoxcloud.com</a>. Do not publicly disclose sensitive details before we have had a reasonable opportunity to investigate.</p></section>
    </PublicPageLayout>
  );
}
