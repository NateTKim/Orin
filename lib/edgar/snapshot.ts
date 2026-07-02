import { resolveTicker } from "./cik.ts";
import { getCompanyFacts, extractMetrics } from "./facts.ts";
import { getLatestFilings, pickLatestFiling } from "./filings.ts";
import type { FilingSnapshot } from "./types.ts";

/**
 * Outcome of a snapshot request. `error` cases carry a user-presentable
 * reason — callers must never surface a raw exception.
 */
export type SnapshotResult =
  | { ok: true; snapshot: FilingSnapshot }
  | { ok: false; reason: "ticker-not-found" | "no-recent-filing" | "edgar-unavailable"; detail: string };

/** Full Phase 1 pipeline: ticker -> CIK -> latest filing -> extracted metrics. */
export async function getFilingSnapshot(ticker: string): Promise<SnapshotResult> {
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

    const facts = await getCompanyFacts(cik.cik);
    const metrics = extractMetrics(facts, filing);

    return {
      ok: true,
      snapshot: {
        ticker: cik.ticker,
        companyName: cik.name,
        cik: cik.cik,
        form: filing.form,
        periodEnd: filing.reportDate,
        filedDate: filing.filedDate,
        filingUrl: filing.documentUrl,
        metrics,
      },
    };
  } catch (err) {
    return {
      ok: false,
      reason: "edgar-unavailable",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
