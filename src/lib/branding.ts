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

export function brandingFont(font: WorkspaceBranding["font_family"]) {
  return font === "classic" ? "Georgia, serif" : font === "editorial" ? "'Times New Roman', serif" : "Inter, ui-sans-serif, system-ui";
}

export function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(value)) return [79, 70, 229];
  return [Number.parseInt(value.slice(0,2),16), Number.parseInt(value.slice(2,4),16), Number.parseInt(value.slice(4,6),16)];
}
