export const GLOBAL_COUNTRIES = {
  "United States": {
    currency: "USD",
    symbol: "$",
    phoneCode: "+1",
    locale: "en-US",
    taxLabel: "Sales Tax",
    timezone: "America/New_York",
    dateFormat: "MM/DD/YYYY",
    states: [],
  },
  "United Kingdom": {
    currency: "GBP",
    symbol: "£",
    phoneCode: "+44",
    locale: "en-GB",
    taxLabel: "VAT",
    timezone: "Europe/London",
    dateFormat: "DD/MM/YYYY",
    states: [],
  },
  Australia: {
    currency: "AUD",
    symbol: "A$",
    phoneCode: "+61",
    locale: "en-AU",
    taxLabel: "GST",
    timezone: "Australia/Sydney",
    dateFormat: "DD/MM/YYYY",
    states: [],
  },
  Japan: {
  currency: "JPY",
  symbol: "¥",
  phoneCode: "+81",
  locale: "ja-JP",
  timezone: "Asia/Tokyo",
  taxLabel: "Consumption Tax",
  dateFormat: "YYYY/MM/DD",
  states: ["Tokyo"],
},
  Singapore: {
    currency: "SGD",
    symbol: "S$",
    phoneCode: "+65",
    locale: "en-SG",
    taxLabel: "GST",
    timezone: "Asia/Singapore",
    dateFormat: "DD/MM/YYYY",
    states: [],
  },
  UAE: {
    currency: "AED",
    symbol: "AED",
    phoneCode: "+971",
    locale: "en-AE",
    taxLabel: "VAT",
    timezone: "Asia/Dubai",
    dateFormat: "DD/MM/YYYY",
    states: [],
  },
  Canada: {
    currency: "CAD",
    symbol: "C$",
    phoneCode: "+1",
    locale: "en-CA",
    taxLabel: "GST/HST",
    timezone: "America/Toronto",
    dateFormat: "DD/MM/YYYY",
    states: [],
  },
} as const;

export type GlobalCountry = keyof typeof GLOBAL_COUNTRIES;

export function getGlobalCountryConfig(country: string) {
  return GLOBAL_COUNTRIES[country as GlobalCountry] ?? GLOBAL_COUNTRIES["United States"];
}

export function getGlobalCountries() {
  return Object.keys(GLOBAL_COUNTRIES);
}