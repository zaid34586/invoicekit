import PublicPageLayout from "../components/public/PublicPageLayout";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section>
    <h2 className="text-xl font-black tracking-[-0.02em] text-slate-950">{title}</h2>
    <div className="mt-3 space-y-3">{children}</div>
  </section>
);

export default function Terms() {
  return (
    <PublicPageLayout
      eyebrow="Legal"
      title="Terms of Service"
      description="These terms explain the rules for using Rivox, including accounts, subscriptions, acceptable use, and ownership of your business data."
      updated="10 July 2026"
    >
      <Section title="1. Acceptance of these terms">
        <p>By creating an account, accessing, or using Rivox, you agree to these Terms of Service and our Privacy Policy. If you do not agree, do not use the service.</p>
      </Section>

      <Section title="2. The Rivox service">
        <p>Rivox is a cloud-based business workspace that may include invoicing, client management, payment tracking, subscriptions, reports, multi-currency tools, tax calculation assistance, team collaboration, and related features.</p>
        <p>Tax, accounting, and financial outputs are provided as operational tools and general information. They are not legal, tax, accounting, or financial advice. You remain responsible for verifying calculations and complying with laws that apply to you.</p>
      </Section>

      <Section title="3. Accounts and eligibility">
        <p>You must provide accurate information, keep your credentials secure, and promptly update account details when they change. You are responsible for activity performed through your account and for ensuring that authorized team members follow these terms.</p>
      </Section>

      <Section title="4. Subscriptions, billing, and renewal">
        <p>Paid plans may be offered monthly or annually and renew automatically until canceled. Current pricing, plan limits, and included features are shown on our pricing page or during checkout.</p>
        <p>For purchases processed by Paddle, Paddle acts as the Merchant of Record and handles checkout, payment processing, applicable indirect tax collection, receipts, refunds, and chargebacks under its buyer terms. Rivox does not store full payment card details.</p>
      </Section>

      <Section title="5. Cancellation and plan changes">
        <p>You may cancel a subscription through the available billing controls or by contacting support. Cancellation normally takes effect at the end of the current paid billing period unless the checkout terms or applicable law provide otherwise. Upgrades, downgrades, credits, and prorations may be handled by the payment provider.</p>
      </Section>

      <Section title="6. Acceptable use">
        <p>You may not use Rivox to break the law, infringe intellectual property, distribute malware, send unlawful spam, attempt unauthorized access, interfere with service integrity, reverse engineer protected parts of the service, or process prohibited products or activities.</p>
      </Section>

      <Section title="7. Your content and business data">
        <p>You retain ownership of the invoices, client records, files, logos, and other content you submit. You grant Rivox a limited right to host, process, transmit, and display that content only as needed to operate, secure, support, and improve the service.</p>
        <p>You confirm that you have the rights and permissions needed to upload and process the information you provide, including personal data relating to clients and team members.</p>
      </Section>

      <Section title="8. Rivox intellectual property">
        <p>Rivox, its software, design, brand, documentation, and original content are protected by intellectual property laws. Except for the limited right to use the service under these terms, no ownership rights are transferred to you.</p>
      </Section>

      <Section title="9. Availability and changes">
        <p>We work to keep Rivox reliable, but uninterrupted access is not guaranteed. We may perform maintenance, modify features, introduce limits, or discontinue parts of the service. Where a material change affects paid users, we will provide reasonable notice when practical.</p>
      </Section>

      <Section title="10. Suspension and termination">
        <p>We may restrict or suspend access where reasonably necessary to protect users, prevent abuse, comply with law, address non-payment, or investigate a breach. You may stop using Rivox at any time. Provisions that by their nature should survive termination will continue to apply.</p>
      </Section>

      <Section title="11. Disclaimers and limitation of liability">
        <p>Rivox is provided on an “as available” basis to the extent permitted by law. We do not guarantee that every calculation, integration, or third-party service will always be accurate or available.</p>
        <p>To the maximum extent permitted by law, Rivox will not be liable for indirect, incidental, special, consequential, or punitive damages, loss of profits, loss of data, or business interruption. Any aggregate liability will not exceed the amount you paid for Rivox during the 12 months before the event giving rise to the claim.</p>
      </Section>

      <Section title="12. Governing terms and updates">
        <p>These terms are governed by applicable law based on the operator’s legal establishment and mandatory consumer protections. We may update these terms and will post the revised date on this page. Continued use after an effective update means you accept the revised terms.</p>
      </Section>

      <Section title="13. Contact">
        <p>Questions about these terms can be sent to <a className="font-bold text-primary-600 hover:underline" href="mailto:support@rivoxcloud.com">support@rivoxcloud.com</a>.</p>
      </Section>
    </PublicPageLayout>
  );
}
