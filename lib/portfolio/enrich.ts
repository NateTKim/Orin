import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin.ts";
import { computeBusinessHealth } from "@/lib/health/score.ts";
import type { FilingApiSuccess } from "@/lib/api-types.ts";
import type { SavedStock, SavedStockWithHealth } from "@/lib/portfolio/types.ts";

/**
 * Attach a Business Health score to each saved company for the dashboard —
 * WITHOUT running any analysis. The score is computed from the CACHED snapshot
 * of the filing the user saved, so the whole cost of this function is a single
 * batched Supabase read (one `IN` query over the saved filings' accession
 * numbers). No EDGAR calls, no Claude calls, no per-company round-trips.
 *
 * A company whose saved filing isn't in the cache yet gets `health: null`; the
 * card then invites the user to open it (opening runs — and caches — the
 * analysis, so it'll have a score on the next dashboard load). We deliberately
 * never trigger that expensive path from the dashboard itself.
 */
export async function attachHealth(stocks: SavedStock[]): Promise<SavedStockWithHealth[]> {
  const accessions = [...new Set(stocks.map((s) => s.accessionNumber).filter(Boolean))];
  if (accessions.length === 0) {
    return stocks.map((s) => ({ ...s, health: null }));
  }

  // One query for the whole portfolio's cached analyses.
  const snapshotByAccession = new Map<string, FilingApiSuccess["snapshot"]>();
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("cached_filings")
      .select("accession_number, result")
      .in("accession_number", accessions);
    if (error) {
      console.error(`[dashboard] health cache read error: ${error.message}`);
    } else {
      for (const row of data ?? []) {
        const result = row.result as FilingApiSuccess | undefined;
        if (result?.snapshot) snapshotByAccession.set(row.accession_number as string, result.snapshot);
      }
    }
  } catch (err) {
    // Degrade gracefully: cards still render, just without health scores.
    console.error(`[dashboard] health enrich threw: ${err instanceof Error ? err.message : String(err)}`);
  }

  return stocks.map((s) => {
    const snapshot = snapshotByAccession.get(s.accessionNumber);
    return { ...s, health: snapshot ? computeBusinessHealth(snapshot) : null };
  });
}
