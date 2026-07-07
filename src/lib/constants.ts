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
  Argentina: { currency: "ARS", symbol: "$", taxLabel: "CUIT" },
  Australia: { currency: "AUD", symbol: "A$", taxLabel: "ABN" },
  Austria: { currency: "EUR", symbol: "€", taxLabel: "VAT Number" },
  Bangladesh: { currency: "BDT", symbol: "৳", taxLabel: "BIN" },
  Belgium: { currency: "EUR", symbol: "€", taxLabel: "VAT Number" },
  Brazil: { currency: "BRL", symbol: "R$", taxLabel: "CNPJ" },
  Canada: { currency: "CAD", symbol: "C$", taxLabel: "GST/HST" },
  China: { currency: "CNY", symbol: "¥", taxLabel: "Tax ID" },
  Denmark: { currency: "DKK", symbol: "kr", taxLabel: "VAT Number" },
  Egypt: { currency: "EGP", symbol: "E£", taxLabel: "Tax ID" },
  Finland: { currency: "EUR", symbol: "€", taxLabel: "VAT Number" },
  France: { currency: "EUR", symbol: "€", taxLabel: "VAT Number" },
  Germany: { currency: "EUR", symbol: "€", taxLabel: "VAT Number" },
  "Hong Kong": { currency: "HKD", symbol: "HK$", taxLabel: "Business Registration No." },
  India: { currency: "INR", symbol: "₹", taxLabel: "GSTIN" },
  Indonesia: { currency: "IDR", symbol: "Rp", taxLabel: "NPWP" },
  Ireland: { currency: "EUR", symbol: "€", taxLabel: "VAT Number" },
  Israel: { currency: "ILS", symbol: "₪", taxLabel: "VAT Number" },
  Italy: { currency: "EUR", symbol: "€", taxLabel: "VAT Number" },
  Japan: { currency: "JPY", symbol: "¥", taxLabel: "Corporate Number" },
  Kenya: { currency: "KES", symbol: "KSh", taxLabel: "PIN" },
  Kuwait: { currency: "KWD", symbol: "KD", taxLabel: "Tax ID" },
  Malaysia: { currency: "MYR", symbol: "RM", taxLabel: "SST Registration No." },
  Mexico: { currency: "MXN", symbol: "MX$", taxLabel: "RFC" },
  Netherlands: { currency: "EUR", symbol: "€", taxLabel: "VAT Number" },
  "New Zealand": { currency: "NZD", symbol: "NZ$", taxLabel: "GST Number" },
  Nigeria: { currency: "NGN", symbol: "₦", taxLabel: "TIN" },
  Norway: { currency: "NOK", symbol: "kr", taxLabel: "VAT Number" },
  Oman: { currency: "OMR", symbol: "OMR", taxLabel: "VAT Number" },
  Pakistan: { currency: "PKR", symbol: "₨", taxLabel: "NTN" },
  Philippines: { currency: "PHP", symbol: "₱", taxLabel: "TIN" },
  Poland: { currency: "PLN", symbol: "zł", taxLabel: "VAT Number" },
  Portugal: { currency: "EUR", symbol: "€", taxLabel: "VAT Number" },
  Qatar: { currency: "QAR", symbol: "QR", taxLabel: "Tax ID" },
  "Saudi Arabia": { currency: "SAR", symbol: "SR", taxLabel: "VAT Number" },
  Singapore: { currency: "SGD", symbol: "S$", taxLabel: "GST" },
  "South Africa": { currency: "ZAR", symbol: "R", taxLabel: "VAT Number" },
  "South Korea": { currency: "KRW", symbol: "₩", taxLabel: "Business Registration Number" },
  Spain: { currency: "EUR", symbol: "€", taxLabel: "VAT Number" },
  "Sri Lanka": { currency: "LKR", symbol: "Rs", taxLabel: "VAT Number" },
  Sweden: { currency: "SEK", symbol: "kr", taxLabel: "VAT Number" },
  Switzerland: { currency: "CHF", symbol: "CHF", taxLabel: "VAT Number" },
  Thailand: { currency: "THB", symbol: "฿", taxLabel: "Tax ID" },
  Turkey: { currency: "TRY", symbol: "₺", taxLabel: "Tax Number" },
  UAE: { currency: "AED", symbol: "AED", taxLabel: "TRN" },
  "United Kingdom": { currency: "GBP", symbol: "£", taxLabel: "VAT Number" },
  "United States": { currency: "USD", symbol: "$", taxLabel: "Tax ID" },
  Vietnam: { currency: "VND", symbol: "₫", taxLabel: "Tax Code" },
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