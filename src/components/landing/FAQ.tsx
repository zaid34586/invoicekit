import { useState } from "react";

const faqs = [
  {
    question: "Is Rivox free to use?",
    answer:
      "Yes. You can create up to 3 invoices every month on the Free plan."
  },
  {
    question: "Can I download invoices as PDF?",
    answer:
      "Yes. Every invoice can be downloaded as a professional PDF."
  },
  {
    question: "Does Rivox support GST?",
    answer:
      "Yes. Rivox supports GSTIN, HSN/SAC, CGST, SGST and IGST."
  },
  {
    question: "Can I send invoices by Email or WhatsApp?",
    answer:
      "Yes. You can share invoices using Email, WhatsApp and public share links."
  },
  {
    question: "Will online payments be supported?",
    answer:
      "Yes. Cashfree will be available for India and Paddle for international customers."
  }
];

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="scroll-mt-24 py-24 bg-white">
      <div className="max-w-4xl mx-auto px-6">

        <div className="text-center mb-14">
          <h2 className="text-4xl font-bold text-slate-900">
            Frequently Asked Questions
          </h2>

          <p className="mt-4 text-slate-600">
            Everything you need to know about Rivox.
          </p>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <div
              key={index}
              className="border border-slate-200 rounded-xl overflow-hidden"
            >
              <button
                onClick={() =>
                  setOpen(open === index ? null : index)
                }
                className="w-full flex justify-between items-center px-6 py-5 text-left font-semibold"
              >
                {faq.question}

                <span className="text-2xl">
                  {open === index ? "−" : "+"}
                </span>
              </button>

              {open === index && (
                <div className="px-6 pb-6 text-slate-600">
                  {faq.answer}
                </div>
              )}
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}