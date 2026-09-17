// Rivox AI Knowledge Base - Rule-based AI for Live Chat
// No external API needed - pure local logic

export interface KnowledgeEntry {
  id: string;
  category: string;
  keywords: string[];
  question: string;
  answer: string;
  followUp?: string[];
  planRequired?: "free" | "pro" | "business";
}

export interface QuickReply {
  id: string;
  label: string;
  message: string;
  icon?: string;
}

// ==================== KNOWLEDGE BASE ====================

export const knowledgeBase: KnowledgeEntry[] = [
  // ========== GETTING STARTED ==========
  {
    id: "create-invoice",
    category: "getting-started",
    keywords: ["invoice", "create", "new", "bill", "make", "generate"],
    question: "How do I create an invoice?",
    answer: `Creating an invoice is easy:

1. Click "New Invoice" from the dashboard or sidebar
2. Select or add your client
3. Add line items (description, quantity, rate)
4. Set invoice date and due date
5. Click "Save" or "Send"

Your invoice will be automatically numbered and saved as a draft.`,
    followUp: ["How do I send an invoice?", "Can I customize my invoice?"],
  },
  {
    id: "add-client",
    category: "getting-started",
    keywords: ["client", "add", "customer", "new", "create"],
    question: "How do I add a client?",
    answer: `To add a new client:

1. Go to "Clients" from the sidebar
2. Click "Add Client"
3. Fill in client details (name, email, country)
4. Add their tax ID if applicable
5. Click "Save"

You can now use this client in any invoice.`,
    followUp: ["How do I edit a client?", "Can I import clients?"],
  },
  {
    id: "setup-business",
    category: "getting-started",
    keywords: ["business", "setup", "profile", "settings", "configure"],
    question: "How do I set up my business?",
    answer: `Setting up your business:

1. Go to "Settings" from the sidebar
2. Add your business name and logo
3. Set your country (this affects currency and tax)
4. Add your tax ID (GSTIN for India, VAT for EU, etc.)
5. Configure payment gateways if needed

Your business details will appear on all invoices.`,
    followUp: ["How do I add my logo?", "How do I set tax rates?"],
  },

  // ========== INVOICING ==========
  {
    id: "send-invoice",
    category: "invoicing",
    keywords: ["send", "email", "share", "invoice", "deliver"],
    question: "How do I send an invoice?",
    answer: `To send an invoice:

1. Open the invoice you want to send
2. Click "Send" button
3. Choose delivery method:
   - Email: Enter client's email address
   - WhatsApp: Share via WhatsApp (Pro feature)
   - Link: Copy public share link
4. Click "Send"

The client will receive a professional invoice with a payment link.`,
    followUp: ["How do I track if invoice is viewed?", "Can I schedule sending?"],
  },
  {
    id: "customize-invoice",
    category: "invoicing",
    keywords: ["customize", "template", "theme", "design", "brand", "logo"],
    question: "Can I customize my invoice?",
    answer: `Yes! You can customize your invoices:

Free Plan:
- Add your business logo
- Basic invoice format

Pro Plan:
- 7 premium templates (Modern, Executive, Minimal, etc.)
- Custom colors and fonts
- Remove Rivox watermark

Business Plan:
- Full custom branding
- Custom PDF templates
- Signature and stamp support

Go to "Settings" > "Brand Studio" to customize.`,
    followUp: ["How do I change colors?", "How do I add a signature?"],
  },
  {
    id: "multi-currency",
    category: "invoicing",
    keywords: ["currency", "multi", "exchange", "rate", "international", "foreign"],
    question: "How does multi-currency work?",
    answer: `Multi-currency invoicing (Pro feature):

1. When creating an invoice, select client's currency
2. Rivox automatically fetches live exchange rates
3. Invoice shows both your currency and client's currency
4. Payment is collected in client's currency
5. You receive payment in your currency

Supported currencies: USD, EUR, GBP, INR, and 160+ more.`,
    followUp: ["What exchange rate is used?", "Can I set a custom rate?"],
  },
  {
    id: "tax-setup",
    category: "invoicing",
    keywords: ["tax", "gst", "vat", "sales tax", "configure", "setup"],
    question: "How do I set up taxes?",
    answer: `Tax setup depends on your country:

India (GST):
- Rivox auto-detects CGST/SGST/IGST
- Enter your GSTIN in business settings
- Tax is calculated automatically

Other Countries:
- Rivox supports 30+ country tax systems
- Enter your tax ID in settings
- Tax rates are applied based on client location

Go to Settings > Tax Configuration to set up.`,
    followUp: ["How does GST work for inter-state?", "Do I need to file taxes through Rivox?"],
  },

  // ========== PAYMENTS ==========
  {
    id: "payment-links",
    category: "payments",
    keywords: ["payment", "link", "stripe", "paypal", "collect", "pay"],
    question: "How do I get paid?",
    answer: `Rivox offers multiple payment options:

Pro Plan:
- Stripe: Credit/debit cards worldwide
- PayPal: PayPal payments
- Payment links on every invoice

Business Plan:
- All Pro features
- Custom payment gateways
- Webhook integrations

Setup: Go to Settings > Payment Gateways`,
    followUp: ["How do I set up Stripe?", "What are the fees?"],
  },
  {
    id: "payment-reminders",
    category: "payments",
    keywords: ["reminder", "overdue", "late", "chase", "follow up"],
    question: "How do payment reminders work?",
    answer: `Payment reminders (Pro feature):

Automatic Reminders:
- 3 days before due date
- On due date
- 3 days after due date
- 7 days after due date

You can customize:
- Reminder frequency
- Message content
- Which invoices to remind

Go to Settings > Payment Reminders to configure.`,
    followUp: ["Can I customize reminder messages?", "How do I stop reminders?"],
  },
  {
    id: "partial-payment",
    category: "payments",
    keywords: ["partial", "installment", "part payment", "balance"],
    question: "Can I accept partial payments?",
    answer: `Yes! Partial payments are supported (Pro feature):

1. When client pays, they can enter any amount
2. Rivox tracks paid vs remaining balance
3. Invoice status updates automatically
4. You can see payment history for each invoice

This is great for installments or milestone payments.`,
    followUp: ["How do I mark an invoice as partially paid?", "Can I set up payment plans?"],
  },

  // ========== ACCOUNT & BILLING ==========
  {
    id: "upgrade-plan",
    category: "billing",
    keywords: ["upgrade", "plan", "pro", "business", "subscribe", "pricing"],
    question: "How do I upgrade my plan?",
    answer: `To upgrade your plan:

1. Go to "Billing" from the sidebar
2. Choose Pro or Business plan
3. Select monthly or yearly billing
4. Complete payment via Paddle

You'll immediately get access to all features in your new plan.

Need help? I can guide you through the process!`,
    followUp: ["What's included in Pro?", "What's included in Business?"],
  },
  {
    id: "free-plan",
    category: "billing",
    keywords: ["free", "limit", "trial", "no cost"],
    question: "What's included in the Free plan?",
    answer: `Free Plan includes:

✅ 25 invoices per month
✅ 25 clients
✅ PDF download
✅ Basic reports
✅ Email sharing

Upgrading to Pro unlocks:
🚀 500 invoices/month
🚀 Payment links
🚀 Multi-currency
🚀 Custom templates
🚀 Auto reminders
🚀 Priority support`,
    followUp: ["How do I upgrade?", "Is there a free trial?"],
  },
  {
    id: "cancel-subscription",
    category: "billing",
    keywords: ["cancel", "subscription", "stop", "downgrade"],
    question: "How do I cancel my subscription?",
    answer: `To cancel your subscription:

1. Go to "Billing"
2. Click "Manage Subscription"
3. Select "Cancel Subscription"
4. Confirm cancellation

Your plan will remain active until the end of the billing period.
You can re-subscribe anytime.`,
    followUp: ["Will I lose my data?", "Can I get a refund?"],
  },

  // ========== TROUBLESHOOTING ==========
  {
    id: "invoice-not-saving",
    category: "troubleshooting",
    keywords: ["not saving", "error", "problem", "issue", "failed"],
    question: "My invoice is not saving. What should I do?",
    answer: `Try these steps:

1. Check your internet connection
2. Make sure all required fields are filled
3. Clear browser cache (Ctrl+Shift+Delete)
4. Try a different browser
5. Check if you've hit your plan limit

If the problem persists, contact support with:
- Screenshot of the error
- Browser and device info
- Steps to reproduce`,
    followUp: ["How do I contact support?", "Is there a status page?"],
  },
  {
    id: "login-issues",
    category: "troubleshooting",
    keywords: ["login", "password", "forgot", "locked", "access"],
    question: "I can't log in. What should I do?",
    answer: `For login issues:

1. Click "Forgot Password" on the login page
2. Check your email for reset link
3. Create a new password

If you still can't log in:
- Check if email is correct
- Try incognito/private window
- Clear browser cookies
- Contact support if locked out`,
    followUp: ["How do I reset my password?", "How do I contact support?"],
  },
  {
    id: "payment-failed",
    category: "troubleshooting",
    keywords: ["payment", "failed", "declined", "error", "checkout"],
    question: "My payment failed. What should I do?",
    answer: `For payment issues:

1. Check card details are correct
2. Ensure sufficient funds
3. Try a different card
4. Contact your bank
5. Try PayPal instead

Common reasons:
- Card expired
- Incorrect CVV
- Bank blocked the transaction
- Insufficient balance

Need help? Contact support with the error message.`,
    followUp: ["How do I contact support?", "What payment methods are accepted?"],
  },

  // ========== FEATURES ==========
  {
    id: "recurring-invoices",
    category: "features",
    keywords: ["recurring", "subscription", "automatic", "repeat", "schedule"],
    question: "Does Rivox support recurring invoices?",
    answer: `Yes! Recurring invoices (Pro feature):

1. Create a new invoice
2. Toggle "Recurring" option
3. Set frequency (Weekly/Monthly/Yearly)
4. Set start and end dates
5. Save - invoices will auto-generate and send

You can pause or cancel recurring invoices anytime.`,
    followUp: ["How do I edit a recurring invoice?", "Can I set different amounts each time?"],
  },
  {
    id: "client-portal",
    category: "features",
    keywords: ["client portal", "client access", "client login", "self service"],
    question: "Is there a client portal?",
    answer: `Yes! Client Portal (Pro feature):

Clients can:
✅ View all their invoices
✅ Download PDFs
✅ Make payments
✅ Update their profile
✅ View payment history

You can:
✅ Customize the portal look
✅ Control what clients see
✅ Send portal access links

Go to Settings > Client Portal to enable.`,
    followUp: ["How do I invite clients to the portal?", "Can I customize the portal?"],
  },
  {
    id: "ai-features",
    category: "features",
    keywords: ["ai", "artificial intelligence", "smart", "automation", "auto"],
    question: "What AI features does Rivox have?",
    answer: `Rivox AI Features:

Free Plan:
🤖 AI Invoice Draft (3/month)
- Describe your work in plain text
- AI creates the invoice automatically

Pro Plan:
🤖 Unlimited AI Invoice Generation
🤖 Smart Payment Reminders
🤖 Revenue Forecasting
🤖 Client Risk Scoring

Business Plan:
🤖 AI Business Reports
🤖 Predictive Analytics
🤖 Custom AI Training`,
    followUp: ["How do I use AI invoice draft?", "How does revenue forecasting work?"],
  },
  {
    id: "reports-analytics",
    category: "features",
    keywords: ["report", "analytics", "insight", "data", "export"],
    question: "What reports are available?",
    answer: `Rivox Reports:

Free Plan:
📊 Basic revenue report
📊 Invoice list
📊 Client list

Pro Plan:
📊 Advanced analytics
📊 Revenue trends
📊 Client insights
📊 Payment analytics
📊 Excel/CSV export

Business Plan:
📊 Custom report builder
📊 AI-powered insights
📊 Predictive analytics
📊 Multi-entity reports`,
    followUp: ["How do I export reports?", "Can I schedule reports?"],
  },

  // ========== CONTACT & SUPPORT ==========
  {
    id: "contact-support",
    category: "support",
    keywords: ["support", "help", "contact", "agent", "talk", "human"],
    question: "How do I contact support?",
    answer: `You can reach our support team:

1. Live Chat: Click the chat button (bottom right)
2. Email: support@rivoxcloud.com
3. Help Center: rivoxcloud.com/help

Response times:
- Pro: Within 24 hours
- Business: Within 4 hours (dedicated support)

For urgent issues, use live chat for fastest response.`,
    followUp: ["What's your response time?", "Is there a phone number?"],
  },
  {
    id: "feature-request",
    category: "support",
    keywords: ["feature", "request", "suggestion", "idea", "improve"],
    question: "I have a feature suggestion!",
    answer: `We love hearing your ideas!

To submit a feature request:
1. Email: feedback@rivoxcloud.com
2. Live Chat: Tell us your idea
3. Help Center: Submit a request

Popular requests we're working on:
- Mobile app
- QuickBooks integration
- More invoice templates

Your feedback shapes Rivox!`,
    followUp: ["What features are coming soon?", "How do I vote on features?"],
  },
];

// ==================== QUICK REPLIES ====================

export const quickReplies: QuickReply[] = [
  { id: "create-invoice", label: "Create Invoice", message: "How do I create an invoice?", icon: "📄" },
  { id: "add-client", label: "Add Client", message: "How do I add a client?", icon: "👤" },
  { id: "get-paid", label: "Get Paid", message: "How do I get paid?", icon: "💰" },
  { id: "upgrade", label: "Upgrade Plan", message: "How do I upgrade my plan?", icon: "⬆️" },
  { id: "help", label: "Get Help", message: "How do I contact support?", icon: "🆘" },
];

export const planQuickReplies: Record<string, QuickReply[]> = {
  free: [
    { id: "upgrade-pro", label: "Upgrade to Pro", message: "What's included in Pro?", icon: "🚀" },
    { id: "ai-draft", label: "AI Invoice Draft", message: "How do I use AI invoice draft?", icon: "🤖" },
    { id: "limits", label: "Check Limits", message: "What are my plan limits?", icon: "📊" },
  ],
  pro: [
    { id: "recurring", label: "Recurring Invoices", message: "How do I set up recurring invoices?", icon: "🔄" },
    { id: "client-portal", label: "Client Portal", message: "How do I enable client portal?", icon: "🌐" },
    { id: "upgrade-business", label: "Upgrade to Business", message: "What's included in Business?", icon: "💼" },
  ],
  business: [
    { id: "api", label: "API Access", message: "How do I use the API?", icon: "🔌" },
    { id: "multi-entity", label: "Multi-Entity", message: "How do I manage multiple businesses?", icon: "🏢" },
    { id: "ai-reports", label: "AI Reports", message: "How do I use AI reports?", icon: "📈" },
  ],
};

// ==================== GREETING MESSAGES ====================

export const greetings = {
  firstTime: "Hi! 👋 I'm Rivox Assistant. I can help you with invoicing, payments, and account questions. What would you like to know?",
  returning: "Welcome back! 😊 How can I help you today?",
  freeUser: "Hi! 👋 I see you're on the Free plan. Need help getting started or want to learn about upgrading?",
  proUser: "Hi! 👋 Welcome, Pro user! Need help with advanced features like recurring invoices or client portal?",
  businessUser: "Hi! 👋 Welcome, Business user! Need help with API, multi-entity, or AI reports?",
};

// ==================== ESCALATION KEYWORDS ====================

export const escalationKeywords = [
  "speak to human",
  "talk to agent",
  "real person",
  "human support",
  "urgent",
  "critical",
  "bug",
  "not working",
  "broken",
  "error",
  "refund",
  "complaint",
  "angry",
  "frustrated",
  "terrible",
  "worst",
];

// ==================== HELPER FUNCTIONS ====================

export function searchKnowledge(query: string): KnowledgeEntry[] {
  const lowerQuery = query.toLowerCase();
  const words = lowerQuery.split(/\s+/).filter(w => w.length > 2);

  const scored = knowledgeBase.map(entry => {
    let score = 0;

    // Exact keyword match (highest score)
    for (const keyword of entry.keywords) {
      if (lowerQuery.includes(keyword)) {
        score += 10;
      }
    }

    // Word-level matching
    for (const word of words) {
      for (const keyword of entry.keywords) {
        if (keyword.includes(word) || word.includes(keyword)) {
          score += 5;
        }
      }
      // Check question words
      if (entry.question.toLowerCase().includes(word)) {
        score += 3;
      }
      // Check answer words
      if (entry.answer.toLowerCase().includes(word)) {
        score += 1;
      }
    }

    return { entry, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(s => s.entry);
}

export function shouldEscalate(message: string): boolean {
  const lower = message.toLowerCase();
  return escalationKeywords.some(keyword => lower.includes(keyword));
}

export function getGreeting(userPlan: string, isFirstTime: boolean): string {
  if (isFirstTime) return greetings.firstTime;

  switch (userPlan) {
    case "business": return greetings.businessUser;
    case "pro": return greetings.proUser;
    default: return greetings.freeUser;
  }
}

export function getQuickReplies(userPlan: string): QuickReply[] {
  const base = quickReplies;
  const planSpecific = planQuickReplies[userPlan] || planQuickReplies.free;
  return [...base, ...planSpecific];
}
