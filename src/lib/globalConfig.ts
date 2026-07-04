export const GLOBAL_COUNTRIES = {
  "United States": {
    currency: "USD",
    symbol: "$",
    phoneCode: "+1",
    locale: "en-US",
    taxLabel: "Sales Tax",
  },
  "United Kingdom": {
    currency: "GBP",
    symbol: "£",
    phoneCode: "+44",
    locale: "en-GB",
    taxLabel: "VAT",
  },
  Australia: {
    currency: "AUD",
    symbol: "A$",
    phoneCode: "+61",
    locale: "en-AU",
    taxLabel: "GST",
  },
  Japan: {
  currency: "JPY",
  symbol: "¥",
  phoneCode: "+81",
  locale: "ja-JP",
  timezone: "Asia/Tokyo",
  taxLabel: "Consumption Tax",
  states: ["Tokyo"],
},
  Singapore: {
    currency: "SGD",
    symbol: "S$",
    phoneCode: "+65",
    locale: "en-SG",
    taxLabel: "GST",
  },
  UAE: {
    currency: "AED",
    symbol: "AED",
    phoneCode: "+971",
    locale: "en-AE",
    taxLabel: "VAT",
  },
  Canada: {
    currency: "CAD",
    symbol: "C$",
    phoneCode: "+1",
    locale: "en-CA",
    taxLabel: "GST/HST",
  },
} as const;

export type GlobalCountry = keyof typeof GLOBAL_COUNTRIES;

export function getGlobalCountryConfig(country: string) {
  return GLOBAL_COUNTRIES[country as GlobalCountry] ?? GLOBAL_COUNTRIES["United States"];
}

export function getGlobalCountries() {
  return Object.keys(GLOBAL_COUNTRIES);
}