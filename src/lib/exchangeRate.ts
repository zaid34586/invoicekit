export interface ExchangeRateResult {
  baseCurrency: string;
  invoiceCurrency: string;
  rate: number;
  lastUpdated: string;
}

export async function getExchangeRate(
  baseCurrency: string,
  invoiceCurrency: string
): Promise<ExchangeRateResult> {
  if (baseCurrency === invoiceCurrency) {
    return {
      baseCurrency,
      invoiceCurrency,
      rate: 1,
      lastUpdated: new Date().toISOString(),
    };
  }

  const response = await fetch(
  `https://api.frankfurter.app/latest?from=${baseCurrency}&to=${invoiceCurrency}`
);

if (!response.ok) {
  throw new Error("Unable to fetch exchange rate.");
}

const data = await response.json();

const rate = data.rates?.[invoiceCurrency];

if (!rate) {
  throw new Error("Exchange rate unavailable.");
}

return {
  baseCurrency,
  invoiceCurrency,
  rate,
  lastUpdated: data.date,
};
}