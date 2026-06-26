import { useState } from "react";

// Placeholder billing history data
const BILLING_HISTORY = [
  {
    id: "1",
    date: "2026-06-15",
    invoiceNumber: "INV-2026-001",
    plan: "Pro",
    amount: 399,
    status: "paid",
  },
  {
    id: "2",
    date: "2026-05-15",
    invoiceNumber: "INV-2026-002",
    plan: "Pro",
    amount: 399,
    status: "paid",
  },
  {
    id: "3",
    date: "2026-04-15",
    invoiceNumber: "INV-2026-003",
    plan: "Free",
    amount: 0,
    status: "paid",
  },
];

function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel,
  onConfirm,
  onClose,
  variant = "primary",
}: {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  variant?: "primary" | "danger";
}) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative card max-w-sm w-full p-6 animate-scale-in">
        <h3 className="text-lg font-semibold text-slate-900 mb-2">{title}</h3>
        <p className="text-sm text-slate-600 mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="btn-secondary px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`px-4 py-2 text-sm text-white rounded-lg ${
              variant === "danger"
                ? "bg-red-600 hover:bg-red-700"
                : "bg-primary-600 hover:bg-primary-700"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function PaymentComingSoonModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative card max-w-sm w-full p-6 animate-scale-in text-center">
        <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-6 h-6 text-primary-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-slate-900 mb-2">
          Coming Soon
        </h3>
        <p className="text-sm text-slate-600 mb-6">
          Payment system will be available soon. Stay tuned!
        </p>
        <button onClick={onClose} className="btn-primary px-6 py-2 text-sm">
          Got it
        </button>
      </div>
    </div>
  );
}

function PricingCard({
  name,
  price,
  description,
  features,
  buttonText,
  onButtonClick,
  current,
  popular,
}: {
  name: string;
  price: string | null;
  description: string;
  features: string[];
  buttonText: string;
  onButtonClick: () => void;
  current?: boolean;
  popular?: boolean;
}) {
  return (
    <div
      className={`relative card p-6 flex flex-col ${
        popular ? "ring-2 ring-primary-500" : ""
      }`}
    >
      {popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="bg-primary-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
            Most Popular
          </span>
        </div>
      )}
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-900">{name}</h3>
        <p className="text-sm text-slate-500 mt-1">{description}</p>
      </div>
      <div className="mb-6">
        {price ? (
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold text-slate-900">{price}</span>
            <span className="text-slate-500 text-sm">/month</span>
          </div>
        ) : (
          <span className="text-3xl font-bold text-slate-900">Free</span>
        )}
      </div>
      <ul className="space-y-3 mb-6 flex-1">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <svg
              className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span className="text-sm text-slate-600">{feature}</span>
          </li>
        ))}
      </ul>
      <button
        onClick={onButtonClick}
        disabled={current}
        className={`w-full py-2.5 rounded-lg font-medium text-sm transition-all ${
          current
            ? "bg-slate-100 text-slate-500 cursor-not-allowed"
            : popular
            ? "btn-primary"
            : "btn-secondary"
        }`}
      >
        {current ? "Current Plan" : buttonText}
      </button>
    </div>
  );
}

export default function Billing() {
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
    variant?: "primary" | "danger";
  } | null>(null);

  // Placeholder data for current plan
  const currentPlan = {
    name: "Free",
    status: "Active",
    renewalDate: null,
    invoicesUsed: 2,
    invoicesLimit: 3,
  };

  const invoicesRemaining = currentPlan.invoicesLimit - currentPlan.invoicesUsed;
  const usagePercentage = (currentPlan.invoicesUsed / currentPlan.invoicesLimit) * 100;

  function handleUpgrade(planName: string) {
    setConfirmModal({
      open: true,
      title: `Upgrade to ${planName}`,
      message: `You are about to upgrade to the ${planName} plan. You will be charged when payment integration is available.`,
      confirmLabel: "Proceed",
      onConfirm: () => {
        setPaymentModalOpen(true);
      },
    });
  }

  function handleCancelSubscription() {
    setConfirmModal({
      open: true,
      title: "Cancel Subscription",
      message:
        "Are you sure you want to cancel your subscription? You will lose access to premium features at the end of your billing period.",
      confirmLabel: "Cancel Subscription",
      variant: "danger",
      onConfirm: () => {},
    });
  }

  function handleContactSupport() {
    setConfirmModal({
      open: true,
      title: "Contact Support",
      message:
        "Our support team will get back to you within 24 hours. Would you like to submit a support request?",
      confirmLabel: "Submit Request",
      onConfirm: () => {},
    });
  }

  function handleAddPaymentMethod() {
    setPaymentModalOpen(true);
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Billing</h1>
        <p className="text-slate-600 mt-1">
          Manage your subscription and billing information
        </p>
      </div>

      {/* Section 1: Current Plan */}
      <section className="card p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Current Plan
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Your active subscription details
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-100 text-green-700 text-sm font-medium">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            {currentPlan.status}
          </span>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">
              Plan
            </p>
            <p className="text-lg font-semibold text-slate-900">
              {currentPlan.name}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">
              Renewal Date
            </p>
            <p className="text-lg font-semibold text-slate-900">
              {currentPlan.renewalDate || "N/A"}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">
              Usage This Month
            </p>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-500 rounded-full transition-all"
                  style={{ width: `${usagePercentage}%` }}
                />
              </div>
              <span className="text-sm font-medium text-slate-700">
                {currentPlan.invoicesUsed}/{currentPlan.invoicesLimit}
              </span>
            </div>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">
              Remaining
            </p>
            <p className="text-lg font-semibold text-slate-900">
              {invoicesRemaining} invoices
            </p>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-slate-100">
          <button
            onClick={() => handleUpgrade("Pro")}
            className="btn-primary px-5 py-2.5"
          >
            Upgrade Plan
          </button>
        </div>
      </section>

      {/* Section 2: Available Plans */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          Available Plans
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          <PricingCard
            name="Free"
            price={null}
            description="For individuals getting started"
            features={["3 invoices/month", "PDF export", "Basic features"]}
            buttonText="Current Plan"
            onButtonClick={() => {}}
            current
          />
          <PricingCard
            name="Pro"
            price="$9"
            description="For professionals and small businesses"
            features={[
              "Unlimited invoices",
              "Client management",
              "PDF without watermark",
              "Email & WhatsApp sharing",
              "Priority support",
            ]}
            buttonText="Upgrade to Pro"
            onButtonClick={() => handleUpgrade("Pro")}
            popular
          />
          <PricingCard
            name="Business"
            price="$29"
            description="For growing teams"
            features={[
              "Everything in Pro",
              "Team support",
              "Advanced reporting",
              "API access (Coming Soon)",
            ]}
            buttonText="Upgrade to Business"
            onButtonClick={() => handleUpgrade("Business")}
          />
        </div>
      </section>

      {/* Section 3: Billing History */}
      <section className="card">
        <div className="p-6 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">
            Billing History
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            View your past invoices and receipts
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
                  Date
                </th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
                  Invoice
                </th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
                  Plan
                </th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
                  Amount
                </th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
                  Status
                </th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
                  Receipt
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {BILLING_HISTORY.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/50 transition">
                  <td className="px-6 py-4 text-sm text-slate-900">
                    {new Date(item.date).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600 font-mono">
                    {item.invoiceNumber}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {item.plan}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-900 font-medium">
                    {item.amount === 0 ? "Free" : `$${item.amount}`}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                        item.status === "paid"
                          ? "bg-green-100 text-green-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {item.status === "paid" && (
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                      {item.status.charAt(0).toUpperCase() +
                        item.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => setPaymentModalOpen(true)}
                      className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                    >
                      Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 4: Payment Methods */}
      <section className="card p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Payment Methods
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Manage your saved payment methods
            </p>
          </div>
          <button onClick={handleAddPaymentMethod} className="btn-secondary">
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4v16m8-8H4"
              />
            </svg>
            Add Payment Method
          </button>
        </div>
        <div className="mt-6 p-8 border-2 border-dashed border-slate-200 rounded-lg text-center">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg
              className="w-6 h-6 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
              />
            </svg>
          </div>
          <p className="text-sm text-slate-500">No payment method added.</p>
        </div>
      </section>

      {/* Section 5: Subscription Actions */}
      <section className="card p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          Subscription Actions
        </h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => handleUpgrade("Pro")}
            className="btn-primary px-5 py-2.5"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 10l7-7m0 0l7 7m-7-7v18"
              />
            </svg>
            Upgrade Plan
          </button>
          <button
            onClick={handleCancelSubscription}
            className="btn-secondary px-5 py-2.5"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
            Cancel Subscription
          </button>
          <button onClick={handleContactSupport} className="btn-ghost px-5 py-2.5">
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            Contact Support
          </button>
        </div>
      </section>

      {/* Modals */}
      <PaymentComingSoonModal
        isOpen={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
      />

      {confirmModal && (
        <ConfirmModal
          isOpen={confirmModal.open}
          title={confirmModal.title}
          message={confirmModal.message}
          confirmLabel={confirmModal.confirmLabel}
          variant={confirmModal.variant}
          onConfirm={confirmModal.onConfirm}
          onClose={() => setConfirmModal(null)}
        />
      )}
    </div>
  );
}
