import PublicPageLayout from "../components/public/PublicPageLayout";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section><h2 className="text-xl font-black tracking-[-0.02em] text-slate-950">{title}</h2><div className="mt-3 space-y-3">{children}</div></section>
);

export default function Privacy() {
  return (
    <PublicPageLayout
      eyebrow="Privacy"
      title="Privacy Policy"
      description="This policy explains what information Rivox collects, why it is used, how it is protected, and the choices available to you."
      updated="10 July 2026"
    >
      <Section title="1. Information we collect">
        <p>Rivox is a brand operated by <b>Mohd Zaid</b>, a sole proprietor. References to "Rivox," "we," "us," or "our" in this policy refer to Mohd Zaid, trading as Rivox.</p>
        <p>We may collect account details such as your name, email, phone number, country, business information, authentication records, and preferences. We also process content you choose to store in Rivox, including invoices, client records, files, payment status, and team communications.</p>
        <p>Technical information may include device and browser data, IP address, approximate location, session identifiers, usage events, diagnostics, and security logs.</p>
      </Section>

      <Section title="2. How we use information">
        <p>We use information to provide and secure Rivox, authenticate users, generate documents, deliver support, improve product performance, prevent fraud and abuse, communicate service notices, and meet legal obligations.</p>
      </Section>

      <Section title="3. Payments and Paddle">
        <p>Paid checkout may be provided by Paddle, acting as Merchant of Record. Paddle processes payment details, applicable taxes, billing records, receipts, refunds, and related compliance information under its own privacy terms. Rivox does not receive or store complete payment card numbers.</p>
      </Section>

      <Section title="4. Cookies and local storage">
        <p>Rivox may use cookies and browser storage that are necessary for sign-in, security, preferences, and session continuity. We may also use limited analytics to understand product usage. You can manage browser storage through your browser settings, but disabling essential storage may prevent parts of Rivox from working.</p>
      </Section>

      <Section title="5. Service providers">
        <p>We may share information with trusted providers that help us host the service, authenticate users, process payments, send email, monitor performance, provide support, or meet legal requirements. They may process information only for authorized purposes and under appropriate safeguards.</p>
      </Section>

      <Section title="6. International data transfers">
        <p>Rivox is intended for international use. Information may be processed in countries other than your own. Where required, we use contractual and organizational safeguards designed to protect transferred personal information.</p>
      </Section>

      <Section title="7. Data retention and deletion">
        <p>We retain information for as long as needed to provide the service, maintain security and audit records, resolve disputes, and comply with legal obligations. You may request account deletion, subject to records we must retain for legitimate legal, tax, fraud-prevention, or billing purposes.</p>
      </Section>

      <Section title="8. Security">
        <p>We use reasonable administrative, technical, and organizational controls, including access restrictions, encrypted connections, authentication controls, and monitoring. No internet service can guarantee absolute security, so users should also protect their credentials and devices.</p>
      </Section>

      <Section title="9. Your rights">
        <p>Depending on where you live, you may have rights to access, correct, delete, restrict, object to, or export personal information, and to withdraw consent where processing relies on consent. We may need to verify your identity before fulfilling a request.</p>
      </Section>

      <Section title="10. Children">
        <p>Rivox is designed for business users and is not directed to children. We do not knowingly collect personal information from children below the minimum legal age in their jurisdiction.</p>
      </Section>

      <Section title="11. Updates and contact">
        <p>We may update this policy as Rivox evolves. The latest revision date will appear above. Privacy questions and requests can be sent to <a className="font-bold text-primary-600 hover:underline" href="mailto:support@rivoxcloud.com">support@rivoxcloud.com</a>.</p>
      </Section>
    </PublicPageLayout>
  );
}
