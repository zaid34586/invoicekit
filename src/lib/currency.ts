// ─── Currency engine for InvoiceKit ────────────────────────────────────────
// This file is the single source of truth for currency logic.
// It is intentionally kept separate from subscription/billing concerns.
import { getGlobalCountryConfig } from "./globalConfig";



const CURRENCY_SYMBOL: Record<string, string> = {
  INR: "₹",
  USD: "$",
  GBP: "£",
  AED: "AED",
  CAD: "C$",
  AUD: "A$",
  SGD: "S$",
  JPY: "¥",
};

// Most currencies use 2 decimal places; add exceptions here if needed.
// JPY has no minor unit in everyday use.
const CURRENCY_DECIMALS: Record<string, number> = {
  INR: 2,
  USD: 2,
  GBP: 2,
  AED: 2,
  CAD: 2,
  AUD: 2,
  SGD: 2,
  JPY: 0,
};

/** Returns the ISO 4217 currency code for a given country name. */
export function getCurrencyForCountry(country: string): string {
  return getGlobalCountryConfig(country).currency;
}

/** Returns the display symbol (e.g. "₹", "$") for a currency code. */
export function getCurrencySymbol(currency: string): string {
  return CURRENCY_SYMBOL[currency] ?? currency;
}

/** Returns how many decimal places to show for a currency. */
export function getCurrencyDecimals(currency: string): number {
  return CURRENCY_DECIMALS[currency] ?? 2;
}

/**
 * Format a number as a money string in the given currency.
 * e.g. formatMoney(1234.5, "INR") → "₹1,234.50"
 */
export function formatMoney(amount: number, currency: string): string {
  const symbol = getCurrencySymbol(currency);
  const decimals = getCurrencyDecimals(currency);
  const rounded = Math.round(amount * Math.pow(10, decimals)) / Math.pow(10, decimals);
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(rounded);
  return `${symbol}${formatted}`;
}
export function getCurrencyFromCountry(country: string) {
  return getGlobalCountryConfig(country).currency;
}
/**
 * Convert an amount from base currency to invoice currency.
 * rate = how many invoice-currency units equal 1 base-currency unit.
 * e.g. base=INR, invoice=USD, rate=0.012 → 1 INR = 0.012 USD
 * If rate is 1 (same currency), amount is returned unchanged.
 */
export function convertCurrency(amount: number, rate: number): number {
  if (!rate || rate <= 0) return amount;
  const result = amount * rate;
  return Math.round(result * 100) / 100;
}