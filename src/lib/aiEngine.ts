// Rivox AI Engine - Processes user messages and generates responses
// Rule-based AI - No external API needed

import {
  searchKnowledge,
  shouldEscalate,
  getGreeting,
  getQuickReplies,
  type KnowledgeEntry,
  type QuickReply,
} from "./aiKnowledge";

export interface AIResponse {
  message: string;
  quickReplies: QuickReply[];
  shouldEscalate: boolean;
  confidence: "high" | "medium" | "low";
  relatedTopics?: string[];
}

export interface ChatContext {
  userPlan: string;
  userName?: string;
  isFirstTime: boolean;
  previousMessages: { role: "user" | "bot"; content: string }[];
  currentPage?: string;
}

// ==================== INTENT DETECTION ====================

type Intent =
  | "greeting"
  | "question"
  | "complaint"
  | "feature_request"
  | "billing"
  | "technical"
  | "unknown";

function detectIntent(message: string): Intent {
  const lower = message.toLowerCase().trim();

  // Greeting patterns
  if (/^(hi|hello|hey|howdy|greetings|good morning|good afternoon|good evening)/.test(lower)) {
    return "greeting";
  }

  // Complaint patterns
  if (/(not working|broken|error|issue|problem|frustrated|angry|terrible|worst|hate|sucks|refund)/.test(lower)) {
    return "complaint";
  }

  // Feature request patterns
  if (/(can you|could you|should|would be nice|feature request|suggestion|add|implement|need)/.test(lower)) {
    return "feature_request";
  }

  // Billing patterns
  if (/(upgrade|plan|price|cost|pay|subscription|cancel|billing|pro|business|free)/.test(lower)) {
    return "billing";
  }

  // Technical patterns
  if (/(how|what|why|where|when|help|setup|configure|install|set up)/.test(lower)) {
    return "technical";
  }

  return "question";
}

// ==================== CONTEXT AWARENESS ====================

function getContextualInfo(context: ChatContext): string {
  const parts: string[] = [];

  if (context.currentPage) {
    const pageHints: Record<string, string> = {
      dashboard: "You're on the dashboard. Need help with anything here?",
      invoices: "You're viewing invoices. Need help creating or managing them?",
      clients: "You're managing clients. Need help adding or editing clients?",
      reports: "You're viewing reports. Need help understanding the data?",
      billing: "You're on the billing page. Need help with your subscription?",
      settings: "You're in settings. Need help configuring something?",
      "new-invoice": "You're creating an invoice. Need help filling it out?",
    };

    if (context.currentPage in pageHints) {
      parts.push(pageHints[context.currentPage]);
    }
  }

  if (context.userPlan === "free" && context.previousMessages.length > 3) {
    parts.push("By the way, you might find our Pro plan helpful for your needs!");
  }

  return parts.join(" ");
}

// ==================== RESPONSE GENERATION ====================

function generateGreetingResponse(context: ChatContext): AIResponse {
  const greeting = getGreeting(context.userPlan, context.isFirstTime);

  return {
    message: greeting,
    quickReplies: getQuickReplies(context.userPlan),
    shouldEscalate: false,
    confidence: "high",
  };
}

function generateKnowledgeResponse(
  entries: KnowledgeEntry[],
  context: ChatContext
): AIResponse {
  if (entries.length === 0) {
    return {
      message: "I'm not sure I understand. Could you rephrase that? Or I can connect you with a support agent.",
      quickReplies: getQuickReplies(context.userPlan),
      shouldEscalate: false,
      confidence: "low",
    };
  }

  const best = entries[0];
  let response = best.answer;

  // Add contextual info
  const contextInfo = getContextualInfo(context);
  if (contextInfo) {
    response = `${contextInfo}\n\n${response}`;
  }

  // Add follow-up suggestions
  const followUpReplies: QuickReply[] = [];
  if (best.followUp) {
    best.followUp.forEach((q, i) => {
      followUpReplies.push({
        id: `followup-${i}`,
        label: q,
        message: q,
      });
    });
  }

  return {
    message: response,
    quickReplies: [...followUpReplies, ...getQuickReplies(context.userPlan)],
    shouldEscalate: false,
    confidence: entries.length > 1 ? "high" : "medium",
    relatedTopics: entries.slice(1).map(e => e.question),
  };
}

function generateComplaintResponse(message: string, context: ChatContext): AIResponse {
  if (shouldEscalate(message)) {
    return {
      message: "I'm sorry to hear you're having trouble. 😔 Let me connect you with a support agent who can help resolve this quickly.",
      quickReplies: [
        { id: "connect-agent", label: "Connect to Agent", message: "I need to speak to a human agent" },
        { id: "describe-issue", label: "Describe Issue", message: "Let me describe the issue in detail" },
      ],
      shouldEscalate: true,
      confidence: "high",
    };
  }

  return {
    message: "I understand your concern. Let me help you find a solution. Can you tell me more about what's happening?",
    quickReplies: getQuickReplies(context.userPlan),
    shouldEscalate: false,
    confidence: "medium",
  };
}

function generateFeatureRequestResponse(): AIResponse {
  return {
    message: "Thanks for the suggestion! 🙏 We're always improving Rivox based on user feedback. You can submit feature requests through:\n\n• Email: feedback@rivoxcloud.com\n• Live Chat: Tell us anytime\n• Help Center: Submit a request\n\nYour feedback helps us build a better product!",
    quickReplies: [
      { id: "what-coming", label: "What's Coming?", message: "What features are coming soon?" },
      { id: "current-features", label: "Current Features", message: "What features are available now?" },
    ],
    shouldEscalate: false,
    confidence: "high",
  };
}

// ==================== MAIN AI FUNCTION ====================

export function processMessage(
  message: string,
  context: ChatContext
): AIResponse {
  const trimmed = message.trim();

  // Handle empty message
  if (!trimmed) {
    return {
      message: "Please type a message and I'll be happy to help!",
      quickReplies: getQuickReplies(context.userPlan),
      shouldEscalate: false,
      confidence: "high",
    };
  }

  // Detect intent
  const intent = detectIntent(trimmed);

  // Handle greetings
  if (intent === "greeting" && trimmed.split(" ").length <= 3) {
    return generateGreetingResponse(context);
  }

  // Handle complaints (check escalation first)
  if (intent === "complaint" || shouldEscalate(trimmed)) {
    return generateComplaintResponse(trimmed, context);
  }

  // Handle feature requests
  if (intent === "feature_request") {
    const knowledge = searchKnowledge(trimmed);
    if (knowledge.length === 0) {
      return generateFeatureRequestResponse();
    }
  }

  // Search knowledge base
  const knowledge = searchKnowledge(trimmed);

  // Generate response based on knowledge
  return generateKnowledgeResponse(knowledge, context);
}

// ==================== AI INVOICE DRAFT ====================

export interface InvoiceDraft {
  clientName: string;
  items: { description: string; quantity: number; rate: number }[];
  notes?: string;
  currency?: string;
  taxRate?: number;
}

export function generateInvoiceDraft(description: string): InvoiceDraft {
  const lower = description.toLowerCase();

  // Parse common service patterns
  const patterns = [
    {
      keywords: ["website", "web", "site"],
      items: [
        { description: "Website Design & Development", quantity: 1, rate: 2500 },
        { description: "Domain & Hosting Setup", quantity: 1, rate: 200 },
        { description: "SEO Optimization", quantity: 1, rate: 500 },
      ],
    },
    {
      keywords: ["logo", "brand", "branding"],
      items: [
        { description: "Logo Design", quantity: 1, rate: 800 },
        { description: "Brand Guidelines", quantity: 1, rate: 500 },
        { description: "Business Card Design", quantity: 1, rate: 200 },
      ],
    },
    {
      keywords: ["app", "mobile", "android", "ios"],
      items: [
        { description: "Mobile App Development", quantity: 1, rate: 5000 },
        { description: "UI/UX Design", quantity: 1, rate: 1500 },
        { description: "App Store Submission", quantity: 1, rate: 300 },
      ],
    },
    {
      keywords: ["content", "writing", "blog", "article"],
      items: [
        { description: "Content Writing", quantity: 5, rate: 150 },
        { description: "SEO Optimization", quantity: 5, rate: 50 },
        { description: "Editing & Proofreading", quantity: 5, rate: 30 },
      ],
    },
    {
      keywords: ["design", "graphic", "poster", "flyer"],
      items: [
        { description: "Graphic Design", quantity: 1, rate: 500 },
        { description: "Print Ready Files", quantity: 1, rate: 100 },
      ],
    },
    {
      keywords: ["photo", "photography", "shoot"],
      items: [
        { description: "Photography Session", quantity: 1, rate: 1000 },
        { description: "Photo Editing", quantity: 10, rate: 50 },
      ],
    },
    {
      keywords: ["video", "animation", "motion"],
      items: [
        { description: "Video Production", quantity: 1, rate: 2000 },
        { description: "Video Editing", quantity: 1, rate: 500 },
      ],
    },
    {
      keywords: ["consult", "consulting", "advice"],
      items: [
        { description: "Consulting Services", quantity: 4, rate: 250 },
      ],
    },
    {
      keywords: ["marketing", "seo", "social media", "ads"],
      items: [
        { description: "Digital Marketing Strategy", quantity: 1, rate: 1500 },
        { description: "Social Media Management", quantity: 1, rate: 800 },
        { description: "Analytics & Reporting", quantity: 1, rate: 300 },
      ],
    },
  ];

  // Find matching pattern
  for (const pattern of patterns) {
    if (pattern.keywords.some(kw => lower.includes(kw))) {
      return {
        clientName: "",
        items: pattern.items,
        notes: "Generated from description: " + description,
      };
    }
  }

  // Default: create a generic service item
  return {
    clientName: "",
    items: [
      {
        description: description.substring(0, 100) || "Professional Services",
        quantity: 1,
        rate: 500,
      },
    ],
    notes: "Please update the rate and description as needed",
  };
}
