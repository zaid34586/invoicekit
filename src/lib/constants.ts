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

// NEW: country -> dial code + states list, used for the Country/State/Phone-code fields
export const COUNTRY_SETTINGS = {
  India: {
    currency: "INR",
    symbol: "₹",
    taxLabel: "GSTIN",
  },

  "United States": {
    currency: "USD",
    symbol: "$",
    taxLabel: "Tax ID",
  },

  "United Kingdom": {
    currency: "GBP",
    symbol: "£",
    taxLabel: "VAT Number",
  },

  Australia: {
    currency: "AUD",
    symbol: "A$",
    taxLabel: "ABN",
  },

  Canada: {
    currency: "CAD",
    symbol: "C$",
    taxLabel: "GST/HST",
  },

  UAE: {
    currency: "AED",
    symbol: "AED",
    taxLabel: "TRN",
  },

  Singapore: {
    currency: "SGD",
    symbol: "S$",
    taxLabel: "GST",
  },

  "South Korea": {
    currency: "KRW",
    symbol: "₩",
    taxLabel: "Business Registration Number",
  },
};

// Shape used by the COUNTRIES array below. Restored so TypeScript can
// resolve `CountryData` (was referenced but never declared).
export interface CountryData {
  name: string;
  code: string;
  states: string[];
}

export const COUNTRIES: CountryData[] = [
  {
    name: "India",
    code: "+91",
    states: INDIAN_STATES,
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
  {
    name: "United Kingdom",
    code: "+44",
    states: ["England", "Scotland", "Wales", "Northern Ireland"],
  },
  {
    name: "UAE",
    code: "+971",
    states: [
      "Abu Dhabi", "Dubai", "Sharjah", "Ajman", "Umm Al Quwain",
      "Ras Al Khaimah", "Fujairah",
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
  {
    name: "Australia",
    code: "+61",
    states: [
      "New South Wales", "Queensland", "South Australia", "Tasmania",
      "Victoria", "Western Australia", "Australian Capital Territory",
      "Northern Territory",
    ],
  },
  {
    name: "Singapore",
    code: "+65",
    states: ["Singapore"],
  },
];

export const FREE_PLAN_LIMIT = 3;
export const PRO_PLAN_PRICE = 399;
export const ADMIN_EMAIL = "admin@invoicekit.app";

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