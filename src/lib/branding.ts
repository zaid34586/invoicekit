export type BrandTemplate = "modern" | "executive" | "minimal" | "corporate" | "luxury";

export interface WorkspaceBranding {
  logo_url: string;
  email_logo_url: string;
  brand_color: string;
  accent_color: string;
  pdf_template: BrandTemplate;
  invoice_theme: string;
  font_family: "modern" | "classic" | "editorial";
  invoice_title: string;
  header_style: "split" | "banner" | "minimal";
  table_style: "solid" | "soft" | "lines";
  footer_text: string;
  email_footer: string;
  payment_instructions: string;
  terms_text: string;
  signature_url: string;
  stamp_url: string;
  background_watermark: string;
  show_signature: boolean;
  show_stamp: boolean;
  remove_rivox_branding: boolean;
}

export const DEFAULT_BRANDING: WorkspaceBranding = {
  logo_url: "", email_logo_url: "", brand_color: "#4f46e5", accent_color: "#7c3aed",
  pdf_template: "modern", invoice_theme: "light", font_family: "modern", invoice_title: "INVOICE",
  header_style: "split", table_style: "solid", footer_text: "Thank you for your business!", email_footer: "",
  payment_instructions: "", terms_text: "", signature_url: "", stamp_url: "", background_watermark: "",
  show_signature: false, show_stamp: false, remove_rivox_branding: true,
};

export const BRAND_PRESETS: Record<BrandTemplate, Partial<WorkspaceBranding>> = {
  modern: { brand_color: "#4F46E5", accent_color: "#06B6D4", font_family: "modern", header_style: "banner", table_style: "soft", invoice_title: "INVOICE" },
  executive: { brand_color: "#0F172A", accent_color: "#D4AF37", font_family: "classic", header_style: "banner", table_style: "solid", invoice_title: "EXECUTIVE INVOICE" },
  minimal: { brand_color: "#111827", accent_color: "#64748B", font_family: "modern", header_style: "minimal", table_style: "lines", invoice_title: "INVOICE" },
  corporate: { brand_color: "#1D4ED8", accent_color: "#0F766E", font_family: "modern", header_style: "split", table_style: "solid", invoice_title: "TAX INVOICE" },
  luxury: { brand_color: "#18120B", accent_color: "#C99A2E", font_family: "editorial", header_style: "banner", table_style: "lines", invoice_title: "PRIVATE INVOICE" },
};

export function applyBrandPreset(value: WorkspaceBranding, template: BrandTemplate): WorkspaceBranding {
  return { ...value, ...BRAND_PRESETS[template], pdf_template: template };
}

/** A fast, private prompt-to-brand generator. It runs in the browser and never sends
 * business details to a third party. A server AI provider can be added later without
 * changing the Brand Studio data model. */
export function designBrandFromPrompt(value: WorkspaceBranding, prompt: string, businessName = "Your Business"): WorkspaceBranding {
  const p = prompt.toLowerCase();
  let template: BrandTemplate = p.includes("luxury") || p.includes("gold") || p.includes("premium") ? "luxury"
    : p.includes("executive") || p.includes("dark") || p.includes("law") || p.includes("finance") ? "executive"
    : p.includes("minimal") || p.includes("simple") || p.includes("clean") ? "minimal"
    : p.includes("corporate") || p.includes("formal") || p.includes("tax") ? "corporate" : "modern";
  let result = applyBrandPreset(value, template);
  if (p.includes("green") || p.includes("eco")) result = { ...result, brand_color: "#166534", accent_color: "#84CC16" };
  if (p.includes("red")) result = { ...result, brand_color: "#991B1B", accent_color: "#F97316" };
  if (p.includes("purple") || p.includes("creative")) result = { ...result, brand_color: "#6D28D9", accent_color: "#EC4899" };
  if (p.includes("blue") || p.includes("technology") || p.includes("saas")) result = { ...result, brand_color: "#1D4ED8", accent_color: "#06B6D4" };
  const shortName = businessName.trim() || "Your Business";
  return {
    ...result,
    background_watermark: p.includes("watermark") ? shortName.toUpperCase().slice(0, 30) : result.background_watermark,
    footer_text: p.includes("friendly") ? `Thank you for choosing ${shortName}.` : result.footer_text,
    payment_instructions: result.payment_instructions || "Please complete payment by the due date using the payment option provided with this invoice.",
    terms_text: result.terms_text || "Payment is due by the invoice due date. Services are governed by the agreed project terms.",
    email_footer: result.email_footer || `${shortName} · Thank you for your business.`,
  };
}

export function brandingFont(font: WorkspaceBranding["font_family"]) {
  return font === "classic" ? "Georgia, serif" : font === "editorial" ? "'Times New Roman', serif" : "Inter, ui-sans-serif, system-ui";
}

export function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(value)) return [79, 70, 229];
  return [Number.parseInt(value.slice(0,2),16), Number.parseInt(value.slice(2,4),16), Number.parseInt(value.slice(4,6),16)];
}
