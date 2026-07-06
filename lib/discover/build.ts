// Pure builder for the discovery feed: turns the curated ticker list into feed
// items using only lightweight EDGAR metadata (no company facts, no filing
// text, no AI). Kept free of Supabase / "server-only" so it can also run in a
// standalone script for testing. Caching lives in feed.ts.

import { resolveTicker } from "../edgar/cik.ts";
import { getLatestFilings } from "../edgar/filings.ts";
import type { FilingRef } from "../edgar/types.ts";
import { DISCOVER_TICKERS } from "./companies.ts";
import type { FeedItem } from "./types.ts";

/** Build the feed: each company's most-recently-filed 10-K/10-Q, newest first. */
export async function buildDiscoverFeed(): Promise<FeedItem[]> {
  // resolveTicker shares one cached ticker map; getLatestFilings requests are
  // serialized and rate-limited inside the EDGAR client, so firing these in
  // parallel is safe — the client paces them under EDGAR's limit.
  const results = await Promise.allSettled(DISCOVER_TICKERS.map(buildOne));

  const items: FeedItem[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) items.push(r.value);
  }
  // Newest filing date first.
  items.sort((a, b) => (a.filedDate < b.filedDate ? 1 : a.filedDate > b.filedDate ? -1 : 0));
  return items;
}

async function buildOne(ticker: string): Promise<FeedItem | null> {
  try {
    const cik = await resolveTicker(ticker);
    if (!cik) return null;

    const { latest10Q, latest10K } = await getLatestFilings(cik.cik);
    const candidates = [latest10Q, latest10K].filter((f): f is FilingRef => f !== null);
    if (candidates.length === 0) return null;

    // The company's most RECENTLY FILED report (by filing date).
    const mostRecent = candidates.reduce((a, b) => (a.filedDate >= b.filedDate ? a : b));

    return {
      ticker: cik.ticker,
      companyName: cik.name,
      form: mostRecent.form,
      filedDate: mostRecent.filedDate,
      accessionNumber: mostRecent.accessionNumber,
      periodEnd: mostRecent.reportDate,
    };
  } catch {
    // Skip any company that fails to resolve / has no usable filing.
    return null;
  }
}
