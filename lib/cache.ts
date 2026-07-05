import "server-only";
import { createSupabaseAdminClient } from "./supabase/admin.ts";
import type { FilingApiSuccess } from "./api-types.ts";

// Shared cache of generated filing analyses, keyed on the SEC accession number
// (the unique ID of one specific filing). Global, not per-user.
//
// Every function here degrades gracefully: on any error — missing table,
// Supabase unreachable — reads return null (treated as a miss) and writes are
// swallowed. Caching must never break a lookup; the worst case is that we
// regenerate as if there were no cache.

const TABLE = "cached_filings";

export interface CacheEntry {
  accessionNumber: string;
  ticker: string;
  form: string;
  periodEnd: string;
  result: FilingApiSuccess;
}

/** Cached result for THIS specific filing, or null on a miss / any error. */
export async function getCachedFiling(accessionNumber: string): Promise<FilingApiSuccess | null> {
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from(TABLE)
      .select("result")
      .eq("accession_number", accessionNumber)
      .maybeSingle();
    if (error) {
      console.error(`[cache] read error: ${error.message}`);
      return null;
    }
    return (data?.result as FilingApiSuccess | undefined) ?? null;
  } catch (err) {
    console.error(`[cache] read threw: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/** Save a freshly generated result, keyed on the filing's accession number. */
export async function setCachedFiling(entry: CacheEntry): Promise<void> {
  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from(TABLE).upsert(
      {
        accession_number: entry.accessionNumber,
        ticker: entry.ticker,
        form: entry.form,
        period_end: entry.periodEnd,
        result: entry.result,
      },
      { onConflict: "accession_number" },
    );
    if (error) console.error(`[cache] write error: ${error.message}`);
  } catch (err) {
    console.error(`[cache] write threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}
