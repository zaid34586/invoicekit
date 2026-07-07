import { COUNTRIES, COUNTRY_SETTINGS } from "./constants";

// Previously this file had its own separate, stale 7-country list (US, UK,
// Australia, Japan, Singapore, UAE, Canada only — not even India!) and fell
// back to "United States" for anything else. That meant BusinessSetup.tsx
// (the mandatory onboarding step for new users) only ever offered 7
// countries to choose from, and Account.tsx would silently show USD for
// any of the other ~41 countries now in the main COUNTRIES list. Both now
// derive from constants.ts, which covers every supported country.
export const GLOBAL_COUNTRIES = Object.fromEntries(
  COUNTRIES.map((c) => {
    const s = COUNTRY_SETTINGS[c.name];
    return [
      c.name,
      {
        currency: s?.currency ?? "USD",
        symbol: s?.symbol ?? "$",
        phoneCode: c.code,
        taxLabel: s?.taxLabel ?? "Tax ID",
        timezone: s?.timezone ?? "UTC",
        dateFormat: s?.dateFormat ?? "DD/MM/YYYY",
        states: c.states,
      },
    ];
  })
);

export type GlobalCountry = keyof typeof GLOBAL_COUNTRIES;

export function getGlobalCountryConfig(country: string) {
  return (
    GLOBAL_COUNTRIES[country as GlobalCountry] ??
    GLOBAL_COUNTRIES["United States"]
  );
}

export function getGlobalCountries() {
  return Object.keys(GLOBAL_COUNTRIES);
}