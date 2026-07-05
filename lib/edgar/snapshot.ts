import { resolveTicker } from "./cik.ts";
import { getCompanyFacts, extractHistory, extractMetrics } from "./facts.ts";
import { getLatestFilings, pickLatestFiling } from "./filings.ts";
import type { CikResult, FilingRef, FilingSnapshot } from "./types.ts";

/** Error shape shared by the resolve and full-snapshot results. */
type SnapshotError = {
  ok: false;
  reason: "ticker-not-found" | "no-recent-filing" | "edgar-unavailable";
  detail: string;
};

export type ResolveResult = { ok: true; cik: CikResult; filing: FilingRef } | SnapshotError;
export type SnapshotResult = { ok: true; snapshot: FilingSnapshot } | SnapshotError;

/**
 * CHEAP step: ticker -> CIK -> the currently-latest filing's metadata,
 * including its accession number. Two small EDGAR calls (the ticker map is
 * cached in memory; the submissions JSON is modest). Deliberately does NOT
 * fetch company facts or the filing document — so a caller can check the
 * cache on the accession number before doing any expensive work.
 */
export async function resolveLatestFiling(ticker: string): Promise<ResolveResult> {
  try {
    const cik = await resolveTicker(ticker);
    if (!cik) {
      return {
        ok: false,
        reason: "ticker-not-found",
        detail: `Ticker "${ticker}" is not in EDGAR's company list.`,
      };
    }

    const filing = pickLatestFiling(await getLatestFilings(cik.cik));
    if (!filing) {
      return {
        ok: false,
        reason: "no-recent-filing",
        detail: `${cik.name} has no 10-Q or 10-K on file with EDGAR.`,
      };
    }

    return { ok: true, cik, filing };
  } catch (err) {
    return {
      ok: false,
      reason: "edgar-unavailable",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * EXPENSIVE step: company facts + metric/history extraction for a known
 * filing. Run only on a cache miss. (The Claude summary is a separate call in
 * lib/summarize.ts.)
 */
export async function buildSnapshot(cik: CikResult, filing: FilingRef): Promise<FilingSnapshot> {
  const facts = await getCompanyFacts(cik.cik);
  const metrics = extractMetrics(facts, filing);
  const { history, historyKind } = extractHistory(facts, filing);
  return {
    ticker: cik.ticker,
    companyName: cik.name,
    cik: cik.cik,
    form: filing.form,
    accessionNumber: filing.accessionNumber,
    periodEnd: filing.reportDate,
    filedDate: filing.filedDate,
    filingUrl: filing.documentUrl,
    metrics,
    history,
    historyKind,
  };
}

/**
 * Full pipeline (resolve + build) in one call. Used by the standalone scripts;
 * the API route uses resolveLatestFiling + buildSnapshot separately so it can
 * check the cache in between.
 */
export async function getFilingSnapshot(ticker: string): Promise<SnapshotResult> {
  const resolved = await resolveLatestFiling(ticker);
  if (!resolved.ok) return resolved;
  try {
    const snapshot = await buildSnapshot(resolved.cik, resolved.filing);
    return { ok: true, snapshot };
  } catch (err) {
    return {
      ok: false,
      reason: "edgar-unavailable",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
