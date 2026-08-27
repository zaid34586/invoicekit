import PublicPageLayout from "../components/public/PublicPageLayout";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section><h2 className="text-xl font-black tracking-[-0.02em] text-slate-950">{title}</h2><div className="mt-3 space-y-3">{children}</div></section>
);

export default function RefundPolicy() {
  return (
    <PublicPageLayout
      eyebrow="Billing"
      title="Refund Policy"
      description="This policy explains cancellations, renewals, refund requests, and how Paddle-managed purchases are handled."
      updated="10 July 2026"
    >
      <Section title="1. Merchant of Record">
        <p>Rivox is a brand operated by <b>Mohd Zaid</b>, a sole proprietor. References to "Rivox," "we," "us," or "our" in this policy refer to Mohd Zaid, trading as Rivox.</p>
        <p>Paid Rivox subscriptions may be sold and processed by Paddle as Merchant of Record. Paddle handles checkout, payment collection, applicable indirect taxes, receipts, chargebacks, and approved refunds. Paddle’s buyer terms and mandatory consumer laws also apply.</p>
      </Section>

      <Section title="2. Initial purchase refund requests">
        <p>You may request a refund within 14 days of an initial subscription purchase. Eligibility may depend on usage, applicable law, Paddle’s buyer terms, and whether the service has been substantially consumed or abused. Nothing in this policy limits rights that cannot legally be excluded.</p>
      </Section>

      <Section title="3. Renewals">
        <p>Subscriptions renew automatically until canceled. Renewal charges are generally non-refundable once a new billing period begins, except where required by law or where Paddle or Rivox determines that an exception is appropriate.</p>
      </Section>

      <Section title="4. Cancellation">
        <p>You can cancel through available billing controls or by contacting support. Cancellation prevents future renewal and normally leaves paid access available until the end of the current billing period. Canceling does not automatically create a refund for time already billed.</p>
      </Section>

      <Section title="5. Duplicate, unauthorized, or incorrect charges">
        <p>Contact us promptly if you believe a charge is duplicated, unauthorized, or incorrect. We may ask for the transaction email, order number, date, and amount so the payment can be located securely.</p>
      </Section>

      <Section title="6. How to request a refund">
        <p>For Paddle-processed purchases, use the support link in your Paddle receipt or Paddle’s buyer support portal. You may also email <a className="font-bold text-primary-600 hover:underline" href="mailto:support@rivoxcloud.com">support@rivoxcloud.com</a> with your order email and transaction details. Do not send full card information.</p>
      </Section>

      <Section title="7. Chargebacks">
        <p>Please contact support before filing a chargeback so we can investigate. Fraudulent or abusive chargebacks may result in account restriction, without affecting legitimate consumer rights.</p>
      </Section>

      <Section title="8. Processing time">
        <p>Approved refunds are returned to the original payment method. Bank and card processing times vary and may take several business days after the refund is issued.</p>
      </Section>
    </PublicPageLayout>
  );
}
