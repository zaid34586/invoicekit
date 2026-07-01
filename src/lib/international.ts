import { COUNTRIES } from "./constants";

export type CountrySettings = {
  name: string;
  phoneCode: string;
  currency: string;
  symbol: string;
  taxLabel: string;
};

export const COUNTRY_SETTINGS: Record<string, CountrySettings> = {
  India: {
    name: "India",
    phoneCode: "+91",
    currency: "INR",
    symbol: "₹",
    taxLabel: "GSTIN",
  },

  "United States": {
    name: "United States",
    phoneCode: "+1",
    currency: "USD",
    symbol: "$",
    taxLabel: "Tax ID",
  },

  "United Kingdom": {
    name: "United Kingdom",
    phoneCode: "+44",
    currency: "GBP",
    symbol: "£",
    taxLabel: "VAT Number",
  },

  UAE: {
    name: "UAE",
    phoneCode: "+971",
    currency: "AED",
    symbol: "AED",
    taxLabel: "TRN",
  },

  Canada: {
    name: "Canada",
    phoneCode: "+1",
    currency: "CAD",
    symbol: "C$",
    taxLabel: "GST/HST",
  },

  Australia: {
    name: "Australia",
    phoneCode: "+61",
    currency: "AUD",
    symbol: "A$",
    taxLabel: "ABN",
  },

  Singapore: {
    name: "Singapore",
    phoneCode: "+65",
    currency: "SGD",
    symbol: "S$",
    taxLabel: "GST Registration",
  },

  "South Korea": {
    name: "South Korea",
    phoneCode: "+82",
    currency: "KRW",
    symbol: "₩",
    taxLabel: "Business Registration Number",
  },
};

export function getCountrySettings(countryName?: string | null) {
  if (!countryName) return COUNTRY_SETTINGS.India;

  return COUNTRY_SETTINGS[countryName] ?? COUNTRY_SETTINGS.India;
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