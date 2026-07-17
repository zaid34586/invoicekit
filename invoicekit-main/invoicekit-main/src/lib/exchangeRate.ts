export interface ExchangeRateResult {
  baseCurrency: string;
  invoiceCurrency: string;
  rate: number;
  lastUpdated: string;
}

// Uses exchangerate-api.com's free, keyless, CORS-enabled endpoint.
//
// NOTE: this previously called Frankfurter (api.frankfurter.app /
// api.frankfurter.dev). Frankfurter only tracks ~31 ECB-published currencies
// and does NOT support AED (UAE Dirham) at all — see
// https://github.com/lineofflight/frankfurter/issues/144. Since this app
// supports UAE as a business/client country, ANY invoice in AED would always
// fail to fetch a live rate, no matter which Frankfurter domain was used.
// That was the real bug — not CORS, not Vercel blocking anything.
// exchangerate-api.com's free "open" endpoint covers 160+ currencies
// (including AED), needs no API key, and works fine from the browser.
const EXCHANGE_RATE_API_BASE = "https://open.er-api.com/v6/latest";

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

  let response: Response;
  try {
    response = await fetch(`${EXCHANGE_RATE_API_BASE}/${baseCurrency}`);
  } catch (networkErr) {
    throw new Error("Network error while fetching exchange rate.");
  }

  if (!response.ok) {
    throw new Error(`Unable to fetch exchange rate (status ${response.status}).`);
  }

  const data = await response.json();

  if (data.result !== "success") {
    throw new Error("Exchange rate provider returned an error.");
  }

  const rate = data.rates?.[invoiceCurrency];

  if (!rate) {
    throw new Error(`Exchange rate unavailable for ${baseCurrency} to ${invoiceCurrency}.`);
  }

  return {
    baseCurrency,
    invoiceCurrency,
    rate,
    lastUpdated: data.time_last_update_utc ?? new Date().toISOString(),
  };
}