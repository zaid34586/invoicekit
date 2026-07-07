// ISO 3166-1 alpha-2 codes, used only to compute flag emoji below.
const COUNTRY_ISO2: Record<string, string> = {
  Argentina: "AR", Australia: "AU", Austria: "AT", Bangladesh: "BD",
  Belgium: "BE", Brazil: "BR", Canada: "CA", China: "CN", Denmark: "DK",
  Egypt: "EG", Finland: "FI", France: "FR", Germany: "DE", "Hong Kong": "HK",
  India: "IN", Indonesia: "ID", Ireland: "IE", Israel: "IL", Italy: "IT",
  Japan: "JP", Kenya: "KE", Kuwait: "KW", Malaysia: "MY", Mexico: "MX",
  Netherlands: "NL", "New Zealand": "NZ", Nigeria: "NG", Norway: "NO",
  Oman: "OM", Pakistan: "PK", Philippines: "PH", Poland: "PL", Portugal: "PT",
  Qatar: "QA", "Saudi Arabia": "SA", Singapore: "SG", "South Africa": "ZA",
  "South Korea": "KR", Spain: "ES", "Sri Lanka": "LK", Sweden: "SE",
  Switzerland: "CH", Thailand: "TH", Turkey: "TR", UAE: "AE",
  "United Kingdom": "GB", "United States": "US", Vietnam: "VN",
};

/** Emoji flag for a country name, e.g. getCountryFlag("India") -> "🇮🇳". */
export function getCountryFlag(country: string | null | undefined): string {
  const iso2 = country ? COUNTRY_ISO2[country] : undefined;
  if (!iso2) return "";
  const codePoints = [...iso2.toUpperCase()].map(
    (c) => 0x1f1e6 + (c.charCodeAt(0) - 65)
  );
  return String.fromCodePoint(...codePoints);
}

export const INDIAN_STATES: string[] = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry",
];

// Single source of truth for everything currency/tax-ID/locale related, per
// country. Previously this data was duplicated (and inconsistently kept up
// to date) across four different files — constants.ts (this file, currency+
// symbol+taxLabel only), international.ts (a stale 8-country copy that fell
// back to India for anything else), globalConfig.ts (a stale 7-country copy
// that fell back to United States for anything else), and Settings.tsx (an
// 8-country copy that also fell back to India). Any country not in one of
// those smaller lists would silently get another country's currency/tax
// label/timezone — e.g. selecting Germany would silently save India's INR
// currency into the business profile. All four now import from here instead.
export interface CountrySetting {
  currency: string;
  symbol: string;
  /** Decimal places to show for this currency (JPY has none in everyday use). */
  decimals: number;
  taxLabel: string;
  taxPlaceholder: string;
  timezone: string;
  /** "MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY/MM/DD" */
  dateFormat: string;
}

export const COUNTRY_SETTINGS: Record<string, CountrySetting> = {
  Argentina: { currency: "ARS", symbol: "$", decimals: 2, taxLabel: "CUIT", taxPlaceholder: "20-12345678-9", timezone: "America/Argentina/Buenos_Aires", dateFormat: "DD/MM/YYYY" },
  Australia: { currency: "AUD", symbol: "A$", decimals: 2, taxLabel: "ABN", taxPlaceholder: "12 345 678 901", timezone: "Australia/Sydney", dateFormat: "DD/MM/YYYY" },
  Austria: { currency: "EUR", symbol: "€", decimals: 2, taxLabel: "VAT Number", taxPlaceholder: "ATU12345678", timezone: "Europe/Vienna", dateFormat: "DD/MM/YYYY" },
  Bangladesh: { currency: "BDT", symbol: "৳", decimals: 2, taxLabel: "BIN", taxPlaceholder: "000000000-0000", timezone: "Asia/Dhaka", dateFormat: "DD/MM/YYYY" },
  Belgium: { currency: "EUR", symbol: "€", decimals: 2, taxLabel: "VAT Number", taxPlaceholder: "BE0123456789", timezone: "Europe/Brussels", dateFormat: "DD/MM/YYYY" },
  Brazil: { currency: "BRL", symbol: "R$", decimals: 2, taxLabel: "CNPJ", taxPlaceholder: "12.345.678/0001-95", timezone: "America/Sao_Paulo", dateFormat: "DD/MM/YYYY" },
  Canada: { currency: "CAD", symbol: "C$", decimals: 2, taxLabel: "GST/HST Number", taxPlaceholder: "123456789RT0001", timezone: "America/Toronto", dateFormat: "DD/MM/YYYY" },
  China: { currency: "CNY", symbol: "¥", decimals: 2, taxLabel: "Tax ID", taxPlaceholder: "91110000MA01XXXX", timezone: "Asia/Shanghai", dateFormat: "YYYY/MM/DD" },
  Denmark: { currency: "DKK", symbol: "kr", decimals: 2, taxLabel: "VAT Number", taxPlaceholder: "DK12345678", timezone: "Europe/Copenhagen", dateFormat: "DD/MM/YYYY" },
  Egypt: { currency: "EGP", symbol: "E£", decimals: 2, taxLabel: "Tax ID", taxPlaceholder: "123-456-789", timezone: "Africa/Cairo", dateFormat: "DD/MM/YYYY" },
  Finland: { currency: "EUR", symbol: "€", decimals: 2, taxLabel: "VAT Number", taxPlaceholder: "FI12345678", timezone: "Europe/Helsinki", dateFormat: "DD/MM/YYYY" },
  France: { currency: "EUR", symbol: "€", decimals: 2, taxLabel: "VAT Number", taxPlaceholder: "FR12345678901", timezone: "Europe/Paris", dateFormat: "DD/MM/YYYY" },
  Germany: { currency: "EUR", symbol: "€", decimals: 2, taxLabel: "VAT Number", taxPlaceholder: "DE123456789", timezone: "Europe/Berlin", dateFormat: "DD/MM/YYYY" },
  "Hong Kong": { currency: "HKD", symbol: "HK$", decimals: 2, taxLabel: "Business Registration No.", taxPlaceholder: "12345678-000", timezone: "Asia/Hong_Kong", dateFormat: "DD/MM/YYYY" },
  India: { currency: "INR", symbol: "₹", decimals: 2, taxLabel: "GSTIN", taxPlaceholder: "22AAAAA0000A1Z5", timezone: "Asia/Kolkata", dateFormat: "DD/MM/YYYY" },
  Indonesia: { currency: "IDR", symbol: "Rp", decimals: 2, taxLabel: "NPWP", taxPlaceholder: "12.345.678.9-012.000", timezone: "Asia/Jakarta", dateFormat: "DD/MM/YYYY" },
  Ireland: { currency: "EUR", symbol: "€", decimals: 2, taxLabel: "VAT Number", taxPlaceholder: "IE1234567T", timezone: "Europe/Dublin", dateFormat: "DD/MM/YYYY" },
  Israel: { currency: "ILS", symbol: "₪", decimals: 2, taxLabel: "VAT Number", taxPlaceholder: "123456789", timezone: "Asia/Jerusalem", dateFormat: "DD/MM/YYYY" },
  Italy: { currency: "EUR", symbol: "€", decimals: 2, taxLabel: "VAT Number", taxPlaceholder: "IT12345678901", timezone: "Europe/Rome", dateFormat: "DD/MM/YYYY" },
  Japan: { currency: "JPY", symbol: "¥", decimals: 0, taxLabel: "Corporate Number", taxPlaceholder: "1234567890123", timezone: "Asia/Tokyo", dateFormat: "YYYY/MM/DD" },
  Kenya: { currency: "KES", symbol: "KSh", decimals: 2, taxLabel: "PIN", taxPlaceholder: "P000000000A", timezone: "Africa/Nairobi", dateFormat: "DD/MM/YYYY" },
  Kuwait: { currency: "KWD", symbol: "KD", decimals: 3, taxLabel: "Tax ID", taxPlaceholder: "000000000", timezone: "Asia/Kuwait", dateFormat: "DD/MM/YYYY" },
  Malaysia: { currency: "MYR", symbol: "RM", decimals: 2, taxLabel: "SST Registration No.", taxPlaceholder: "W10-1808-32000000", timezone: "Asia/Kuala_Lumpur", dateFormat: "DD/MM/YYYY" },
  Mexico: { currency: "MXN", symbol: "MX$", decimals: 2, taxLabel: "RFC", taxPlaceholder: "XAXX010101000", timezone: "America/Mexico_City", dateFormat: "DD/MM/YYYY" },
  Netherlands: { currency: "EUR", symbol: "€", decimals: 2, taxLabel: "VAT Number", taxPlaceholder: "NL123456789B01", timezone: "Europe/Amsterdam", dateFormat: "DD/MM/YYYY" },
  "New Zealand": { currency: "NZD", symbol: "NZ$", decimals: 2, taxLabel: "GST Number", taxPlaceholder: "123-456-789", timezone: "Pacific/Auckland", dateFormat: "DD/MM/YYYY" },
  Nigeria: { currency: "NGN", symbol: "₦", decimals: 2, taxLabel: "TIN", taxPlaceholder: "12345678-0001", timezone: "Africa/Lagos", dateFormat: "DD/MM/YYYY" },
  Norway: { currency: "NOK", symbol: "kr", decimals: 2, taxLabel: "VAT Number", taxPlaceholder: "NO123456789MVA", timezone: "Europe/Oslo", dateFormat: "DD/MM/YYYY" },
  Oman: { currency: "OMR", symbol: "OMR", decimals: 3, taxLabel: "VAT Number", taxPlaceholder: "OM1234567890123", timezone: "Asia/Muscat", dateFormat: "DD/MM/YYYY" },
  Pakistan: { currency: "PKR", symbol: "₨", decimals: 2, taxLabel: "NTN", taxPlaceholder: "1234567-8", timezone: "Asia/Karachi", dateFormat: "DD/MM/YYYY" },
  Philippines: { currency: "PHP", symbol: "₱", decimals: 2, taxLabel: "TIN", taxPlaceholder: "123-456-789-000", timezone: "Asia/Manila", dateFormat: "MM/DD/YYYY" },
  Poland: { currency: "PLN", symbol: "zł", decimals: 2, taxLabel: "VAT Number", taxPlaceholder: "PL1234567890", timezone: "Europe/Warsaw", dateFormat: "DD/MM/YYYY" },
  Portugal: { currency: "EUR", symbol: "€", decimals: 2, taxLabel: "VAT Number", taxPlaceholder: "PT123456789", timezone: "Europe/Lisbon", dateFormat: "DD/MM/YYYY" },
  Qatar: { currency: "QAR", symbol: "QR", decimals: 2, taxLabel: "Tax ID", taxPlaceholder: "12345678901", timezone: "Asia/Qatar", dateFormat: "DD/MM/YYYY" },
  "Saudi Arabia": { currency: "SAR", symbol: "SR", decimals: 2, taxLabel: "VAT Number", taxPlaceholder: "300000000000003", timezone: "Asia/Riyadh", dateFormat: "DD/MM/YYYY" },
  Singapore: { currency: "SGD", symbol: "S$", decimals: 2, taxLabel: "GST Registration No.", taxPlaceholder: "M90312345A", timezone: "Asia/Singapore", dateFormat: "DD/MM/YYYY" },
  "South Africa": { currency: "ZAR", symbol: "R", decimals: 2, taxLabel: "VAT Number", taxPlaceholder: "4123456789", timezone: "Africa/Johannesburg", dateFormat: "DD/MM/YYYY" },
  "South Korea": { currency: "KRW", symbol: "₩", decimals: 0, taxLabel: "Business Registration Number", taxPlaceholder: "000-00-00000", timezone: "Asia/Seoul", dateFormat: "YYYY/MM/DD" },
  Spain: { currency: "EUR", symbol: "€", decimals: 2, taxLabel: "VAT Number", taxPlaceholder: "ESB12345678", timezone: "Europe/Madrid", dateFormat: "DD/MM/YYYY" },
  "Sri Lanka": { currency: "LKR", symbol: "Rs", decimals: 2, taxLabel: "VAT Number", taxPlaceholder: "123456789-7000", timezone: "Asia/Colombo", dateFormat: "DD/MM/YYYY" },
  Sweden: { currency: "SEK", symbol: "kr", decimals: 2, taxLabel: "VAT Number", taxPlaceholder: "SE123456789001", timezone: "Europe/Stockholm", dateFormat: "DD/MM/YYYY" },
  Switzerland: { currency: "CHF", symbol: "CHF", decimals: 2, taxLabel: "VAT Number", taxPlaceholder: "CHE-123.456.789", timezone: "Europe/Zurich", dateFormat: "DD/MM/YYYY" },
  Thailand: { currency: "THB", symbol: "฿", decimals: 2, taxLabel: "Tax ID", taxPlaceholder: "1234567890123", timezone: "Asia/Bangkok", dateFormat: "DD/MM/YYYY" },
  Turkey: { currency: "TRY", symbol: "₺", decimals: 2, taxLabel: "Tax Number", taxPlaceholder: "1234567890", timezone: "Europe/Istanbul", dateFormat: "DD/MM/YYYY" },
  UAE: { currency: "AED", symbol: "AED", decimals: 2, taxLabel: "TRN", taxPlaceholder: "100123456700003", timezone: "Asia/Dubai", dateFormat: "DD/MM/YYYY" },
  "United Kingdom": { currency: "GBP", symbol: "£", decimals: 2, taxLabel: "VAT Number", taxPlaceholder: "GB123456789", timezone: "Europe/London", dateFormat: "DD/MM/YYYY" },
  "United States": { currency: "USD", symbol: "$", decimals: 2, taxLabel: "EIN / Tax ID", taxPlaceholder: "12-3456789", timezone: "America/New_York", dateFormat: "MM/DD/YYYY" },
  Vietnam: { currency: "VND", symbol: "₫", decimals: 0, taxLabel: "Tax Code", taxPlaceholder: "0123456789", timezone: "Asia/Ho_Chi_Minh", dateFormat: "DD/MM/YYYY" },
};

/**
 * Safe lookup with a clearly-neutral fallback. IMPORTANT: this deliberately
 * does NOT fall back to India or the United States — a silent wrong-country
 * fallback (e.g. showing ₹ or $ for a country we don't recognize) is exactly
 * the bug class this file exists to prevent. In practice this fallback
 * should never trigger since every entry in COUNTRIES above has a matching
 * COUNTRY_SETTINGS entry.
 */
export function getCountrySetting(country: string | null | undefined): CountrySetting {
  if (country && COUNTRY_SETTINGS[country]) return COUNTRY_SETTINGS[country];
  return {
    currency: "USD",
    symbol: "$",
    decimals: 2,
    taxLabel: "Tax ID",
    taxPlaceholder: "Enter your tax ID",
    timezone: "UTC",
    dateFormat: "DD/MM/YYYY",
  };
}

// Shape used by the COUNTRIES array below. Restored so TypeScript can
// resolve `CountryData` (was referenced but never declared).
export interface CountryData {
  name: string;
  code: string;
  states: string[];
}

export const COUNTRIES: CountryData[] = [
  {
    name: "Argentina",
    code: "+54",
    states: [],
  },
  {
    name: "Australia",
    code: "+61",
    states: [
      "New South Wales", "Queensland", "South Australia", "Tasmania",
      "Victoria", "Western Australia", "Australian Capital Territory",
      "Northern Territory",
    ],
  },
  { name: "Austria", code: "+43", states: [] },
  { name: "Bangladesh", code: "+880", states: [] },
  { name: "Belgium", code: "+32", states: [] },
  {
    name: "Brazil",
    code: "+55",
    states: [
      "Acre", "Alagoas", "Amapá", "Amazonas", "Bahia", "Ceará",
      "Distrito Federal", "Espírito Santo", "Goiás", "Maranhão",
      "Mato Grosso", "Mato Grosso do Sul", "Minas Gerais", "Pará",
      "Paraíba", "Paraná", "Pernambuco", "Piauí", "Rio de Janeiro",
      "Rio Grande do Norte", "Rio Grande do Sul", "Rondônia", "Roraima",
      "Santa Catarina", "São Paulo", "Sergipe", "Tocantins",
    ],
  },
  {
    name: "Canada",
    code: "+1",
    states: [
      "Alberta", "British Columbia", "Manitoba", "New Brunswick",
      "Newfoundland and Labrador", "Nova Scotia", "Ontario",
      "Prince Edward Island", "Quebec", "Saskatchewan",
      "Northwest Territories", "Nunavut", "Yukon",
    ],
  },
  { name: "China", code: "+86", states: [] },
  { name: "Denmark", code: "+45", states: [] },
  { name: "Egypt", code: "+20", states: [] },
  { name: "Finland", code: "+358", states: [] },
  {
    name: "France",
    code: "+33",
    states: [
      "Auvergne-Rhône-Alpes", "Bourgogne-Franche-Comté", "Bretagne",
      "Centre-Val de Loire", "Corse", "Grand Est", "Hauts-de-France",
      "Île-de-France", "Normandie", "Nouvelle-Aquitaine", "Occitanie",
      "Pays de la Loire", "Provence-Alpes-Côte d'Azur",
    ],
  },
  {
    name: "Germany",
    code: "+49",
    states: [
      "Baden-Württemberg", "Bavaria", "Berlin", "Brandenburg", "Bremen",
      "Hamburg", "Hesse", "Lower Saxony", "Mecklenburg-Vorpommern",
      "North Rhine-Westphalia", "Rhineland-Palatinate", "Saarland", "Saxony",
      "Saxony-Anhalt", "Schleswig-Holstein", "Thuringia",
    ],
  },
  { name: "Hong Kong", code: "+852", states: [] },
  {
    name: "India",
    code: "+91",
    states: INDIAN_STATES,
  },
  { name: "Indonesia", code: "+62", states: [] },
  { name: "Ireland", code: "+353", states: [] },
  { name: "Israel", code: "+972", states: [] },
  { name: "Italy", code: "+39", states: [] },
  { name: "Japan", code: "+81", states: [] },
  { name: "Kenya", code: "+254", states: [] },
  { name: "Kuwait", code: "+965", states: [] },
  { name: "Malaysia", code: "+60", states: [] },
  {
    name: "Mexico",
    code: "+52",
    states: [
      "Aguascalientes", "Baja California", "Baja California Sur", "Campeche",
      "Chiapas", "Chihuahua", "Ciudad de México", "Coahuila", "Colima",
      "Durango", "Guanajuato", "Guerrero", "Hidalgo", "Jalisco",
      "México", "Michoacán", "Morelos", "Nayarit", "Nuevo León",
      "Oaxaca", "Puebla", "Querétaro", "Quintana Roo", "San Luis Potosí",
      "Sinaloa", "Sonora", "Tabasco", "Tamaulipas", "Tlaxcala",
      "Veracruz", "Yucatán", "Zacatecas",
    ],
  },
  { name: "Netherlands", code: "+31", states: [] },
  { name: "New Zealand", code: "+64", states: [] },
  { name: "Nigeria", code: "+234", states: [] },
  { name: "Norway", code: "+47", states: [] },
  { name: "Oman", code: "+968", states: [] },
  { name: "Pakistan", code: "+92", states: [] },
  { name: "Philippines", code: "+63", states: [] },
  { name: "Poland", code: "+48", states: [] },
  { name: "Portugal", code: "+351", states: [] },
  { name: "Qatar", code: "+974", states: [] },
  { name: "Saudi Arabia", code: "+966", states: [] },
  {
    name: "Singapore",
    code: "+65",
    states: ["Singapore"],
  },
  {
    name: "South Africa",
    code: "+27",
    states: [
      "Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal", "Limpopo",
      "Mpumalanga", "Northern Cape", "North West", "Western Cape",
    ],
  },
  { name: "South Korea", code: "+82", states: [] },
  { name: "Spain", code: "+34", states: [] },
  { name: "Sri Lanka", code: "+94", states: [] },
  { name: "Sweden", code: "+46", states: [] },
  { name: "Switzerland", code: "+41", states: [] },
  { name: "Thailand", code: "+66", states: [] },
  { name: "Turkey", code: "+90", states: [] },
  {
    name: "UAE",
    code: "+971",
    states: [
      "Abu Dhabi", "Dubai", "Sharjah", "Ajman", "Umm Al Quwain",
      "Ras Al Khaimah", "Fujairah",
    ],
  },
  {
    name: "United Kingdom",
    code: "+44",
    states: ["England", "Scotland", "Wales", "Northern Ireland"],
  },
  {
    name: "United States",
    code: "+1",
    states: [
      "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
      "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho",
      "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana",
      "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota",
      "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
      "New Hampshire", "New Jersey", "New Mexico", "New York",
      "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon",
      "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
      "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington",
      "West Virginia", "Wisconsin", "Wyoming",
    ],
  },
  { name: "Vietnam", code: "+84", states: [] },
];

export const FREE_PLAN_LIMIT = 3;
export const PRO_PLAN_PRICE = 399;
export const ADMIN_EMAIL = "mz7123272@gmail.com";

export function formatINR(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  const parts = rounded.toFixed(2).split(".");
  const intPart = parts[0];
  const decPart = parts[1] || "00";
  const lastThree = intPart.slice(-3);
  const otherNumbers = intPart.slice(0, -3);
  const formattedInt =
    otherNumbers !== ""
      ? otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + lastThree
      : lastThree;
  return `₹${formattedInt}.${decPart}`;
}
export function formatCurrency(
  amount: number,
  symbol: string = "₹"
): string {
  const rounded = Math.round(amount * 100) / 100;

  return (
    symbol +
    new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(rounded)
  );
}
export function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

export function addDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}