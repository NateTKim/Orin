import { fetchEdgarJson } from "./client.ts";
import type { CikResult, CompanyTickersResponse } from "./types.ts";

const TICKER_MAP_URL = "https://www.sec.gov/files/company_tickers.json";

// The ticker map is ~1MB and changes rarely; fetch once per process.
let tickerMapPromise: Promise<Map<string, CikResult>> | null = null;

async function loadTickerMap(): Promise<Map<string, CikResult>> {
  const raw = await fetchEdgarJson<CompanyTickersResponse>(TICKER_MAP_URL);
  const map = new Map<string, CikResult>();
  for (const entry of Object.values(raw)) {
    map.set(entry.ticker.toUpperCase(), {
      cik: String(entry.cik_str).padStart(10, "0"),
      name: entry.title,
      ticker: entry.ticker.toUpperCase(),
    });
  }
  return map;
}

/**
 * Resolve a ticker to its zero-padded 10-digit CIK.
 * Returns null for tickers EDGAR doesn't know — callers show "not found".
 */
export async function resolveTicker(ticker: string): Promise<CikResult | null> {
  if (!tickerMapPromise) {
    tickerMapPromise = loadTickerMap().catch((err) => {
      // Don't cache a failed load; the next call should retry.
      tickerMapPromise = null;
      throw err;
    });
  }
  const map = await tickerMapPromise;
  return map.get(ticker.trim().toUpperCase()) ?? null;
}
