import { COUNTRIES, COUNTRY_SETTINGS, getCountrySetting } from "./constants";

export type CountrySettings = {
  name: string;
  phoneCode: string;
  currency: string;
  symbol: string;
  taxLabel: string;
};

// Kept for any existing callers that iterate this directly. Previously this
// was its own separate, stale 8-country object that fell back to INDIA for
// any country not in it — meaning a German or Japanese invoice's tax-ID
// label (e.g. in InvoicePreview.tsx / pdf.ts) would silently show "GSTIN".
// Now derived from constants.ts's COUNTRY_SETTINGS, which covers every
// country in the COUNTRIES list.
export const COUNTRY_SETTINGS_FULL: Record<string, CountrySettings> = Object.fromEntries(
  COUNTRIES.map((c) => {
    const setting = COUNTRY_SETTINGS[c.name];
    return [
      c.name,
      {
        name: c.name,
        phoneCode: c.code,
        currency: setting?.currency ?? "USD",
        symbol: setting?.symbol ?? "$",
        taxLabel: setting?.taxLabel ?? "Tax ID",
      },
    ];
  })
);

export function getCountrySettings(countryName?: string | null): CountrySettings {
  if (!countryName) {
    return { name: "United States", phoneCode: "+1", currency: "USD", symbol: "$", taxLabel: "Tax ID" };
  }
  const found = COUNTRY_SETTINGS_FULL[countryName];
  if (found) return found;
  // Neutral fallback — NOT India, NOT any specific country — so an
  // unrecognised country never silently inherits another country's tax
  // label/currency.
  const setting = getCountrySetting(countryName);
  return {
    name: countryName,
    phoneCode: COUNTRIES.find((c) => c.name === countryName)?.code ?? "+1",
    currency: setting.currency,
    symbol: setting.symbol,
    taxLabel: setting.taxLabel,
  };
}

export function getCountryPhoneCode(countryName?: string | null) {
  return getCountrySettings(countryName).phoneCode;
}

export function getCurrencySymbol(countryName?: string | null) {
  return getCountrySettings(countryName).symbol;
}

export function getTaxLabel(countryName?: string | null) {
  return getCountrySettings(countryName).taxLabel;
}

export function formatCurrency(
  amount: number,
  countryName?: string | null
): string {
  const settings = getCountrySettings(countryName);

  return (
    settings.symbol +
    new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(amount || 0))
  );
}

export function isSupportedCountry(countryName: string) {
  return Boolean(
    COUNTRIES.find((country) => country.name === countryName)
  );
}