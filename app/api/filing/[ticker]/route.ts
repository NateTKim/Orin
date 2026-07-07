import { NextResponse } from "next/server";
import { resolveLatestFiling, buildSnapshot } from "@/lib/edgar/snapshot.ts";
import { summarizeFiling } from "@/lib/summarize.ts";
import { getCachedFiling, setCachedFiling } from "@/lib/cache.ts";
import { clientKey, recordAndCheck } from "@/lib/rate-limit.ts";
import type { CikResult, FilingRef } from "@/lib/edgar/types.ts";
import type { FilingApiResponse, FilingApiSuccess } from "@/lib/api-types.ts";

// EDGAR fetches + the Claude call take well over the default function
// timeout; give the Vercel function the full minute.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const TICKER_RE = /^[A-Za-z][A-Za-z.\-]{0,9}$/;

// Errors that mean "no such filing to show" vs. a transient upstream problem.
const ERROR_MESSAGES: Record<string, string> = {
  "no-recent-filing": "This company has no 10-Q or 10-K on file with the SEC.",
  "edgar-unavailable": "SEC EDGAR isn't responding right now. Please try again in a moment.",
};

// In-flight analyses keyed on accession number. If two requests race for the
// same uncached filing, the second joins the first's promise instead of
// starting a duplicate (expensive) Claude call. Entries are removed when the
// originating request settles.
const inFlight = new Map<string, Promise<FilingApiSuccess>>();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> },
): Promise<NextResponse<FilingApiResponse>> {
  const { ticker } = await params;
  const trimmed = ticker.trim();

  if (!TICKER_RE.test(trimmed)) {
    return NextResponse.json(
      { ok: false, message: "That doesn't look like a stock ticker. Try something like AAPL." },
      { status: 400 },
    );
  }

  // --- CHEAP step: which filing is currently the latest for this ticker? ---
  // This is the lightweight EDGAR check that gives us the accession number we
  // key the cache on. No company facts or filing text are fetched yet.
  const resolved = await resolveLatestFiling(trimmed);
  if (!resolved.ok) {
    console.error(`filing lookup failed [${resolved.reason}]: ${resolved.detail}`);
    const message =
      resolved.reason === "ticker-not-found"
        ? `We couldn't find "${trimmed.toUpperCase()}" in SEC EDGAR. Check the ticker and try again.`
        : ERROR_MESSAGES[resolved.reason];
    const status = resolved.reason === "edgar-unavailable" ? 502 : 404;
    return NextResponse.json({ ok: false, message }, { status });
  }
  const { cik, filing } = resolved;

  // --- CACHE CHECK, keyed on the specific filing (accession number) ---
  // A hit means we already analyzed exactly this filing: return it instantly
  // and skip the company facts, the filing-text download, and the Claude call.
  const cached = await getCachedFiling(filing.accessionNumber);
  if (cached) {
    // Entries cached before the accessionNumber field existed won't carry it;
    // the accession we just resolved IS the cache key, so set it either way so
    // the Save button always has the filing's unique ID.
    cached.snapshot.accessionNumber = filing.accessionNumber;
    console.log(`[cache HIT] ${cik.ticker} ${filing.form} ${filing.accessionNumber}`);
    return NextResponse.json(cached, { headers: { "x-orin-cache": "HIT" } });
  }
  console.log(
    `[cache MISS] ${cik.ticker} ${filing.form} ${filing.accessionNumber} — running full analysis`,
  );

  // --- RATE-LIMIT GATE: only reached on a cache miss, i.e. when we're about to
  // do the expensive (billable) work. Cache hits and the cheap rejections above
  // never get here, so normal browsing is never throttled. ---
  const key = clientKey(request);
  const limit = recordAndCheck(key);
  if (!limit.allowed) {
    console.warn(`[rate-limit] ${key} blocked (retry in ${limit.retryAfterSec}s)`);
    return NextResponse.json(
      {
        ok: false,
        message:
          "You're looking up companies faster than we can read filings. Give it a few minutes and try again.",
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  // --- EXPENSIVE step (only on a miss). Coalesce concurrent requests for the
  // SAME filing onto one analysis so a race can't run two Claude calls. ---
  let payload: FilingApiSuccess;
  try {
    payload = await dedupedAnalysis(cik, filing);
  } catch (err) {
    console.error(`snapshot build failed: ${err instanceof Error ? err.message : String(err)}`);
    return NextResponse.json(
      { ok: false, message: ERROR_MESSAGES["edgar-unavailable"] },
      { status: 502 },
    );
  }

  return NextResponse.json(payload, { headers: { "x-orin-cache": "MISS" } });
}

/**
 * Run the full analysis for one filing, sharing a single in-flight execution
 * across concurrent callers keyed on accession number. The first caller starts
 * the work and registers the promise; later callers awaiting the same filing
 * join it. The originator clears the entry once settled.
 */
function dedupedAnalysis(cik: CikResult, filing: FilingRef): Promise<FilingApiSuccess> {
  const existing = inFlight.get(filing.accessionNumber);
  if (existing) {
    console.log(`[dedupe] joining in-flight analysis for ${filing.accessionNumber}`);
    return existing;
  }

  const run = runAnalysis(cik, filing).finally(() => {
    inFlight.delete(filing.accessionNumber);
  });
  inFlight.set(filing.accessionNumber, run);
  return run;
}

/**
 * The actual expensive path: extract numbers, write the summary, cache a fully
 * successful result. Rejects only when the snapshot build itself fails (a
 * summary failure is folded into the payload as a note, never a rejection).
 */
async function runAnalysis(cik: CikResult, filing: FilingRef): Promise<FilingApiSuccess> {
  const snapshot = await buildSnapshot(cik, filing); // rejects -> 502 upstream

  // The numbers are the product; a summary failure must not sink the response.
  let summary: string | null = null;
  let summaryNote: string | null = null;
  const summaryResult = await summarizeFiling(snapshot);
  if (summaryResult.error) {
    summaryNote = "The plain-English summary is temporarily unavailable.";
  } else if (summaryResult.inventedNumberWarnings.length > 0) {
    // Never show a summary containing a number we didn't extract.
    summaryNote =
      "The summary was withheld because it failed our accuracy check. The figures above come directly from the SEC filing.";
  } else {
    summary = summaryResult.summary;
  }

  const payload: FilingApiSuccess = { ok: true, snapshot, summary, summaryNote };

  // Only cache a fully successful result. If the summary failed or was withheld
  // (a transient or borderline case), we skip caching so the NEXT lookup retries
  // the analysis rather than serving a degraded result until the next filing.
  if (summary !== null) {
    await setCachedFiling({
      accessionNumber: filing.accessionNumber,
      ticker: cik.ticker,
      form: filing.form,
      periodEnd: filing.reportDate,
      result: payload,
    });
  } else {
    console.log(
      `[cache SKIP] ${cik.ticker} ${filing.accessionNumber} — summary unavailable, not caching`,
    );
  }

  return payload;
}
