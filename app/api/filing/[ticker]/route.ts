import { NextResponse } from "next/server";
import { resolveLatestFiling, buildSnapshot } from "@/lib/edgar/snapshot.ts";
import { summarizeFiling } from "@/lib/summarize.ts";
import { getCachedFiling, setCachedFiling } from "@/lib/cache.ts";
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

export async function GET(
  _request: Request,
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
    console.log(`[cache HIT] ${cik.ticker} ${filing.form} ${filing.accessionNumber}`);
    return NextResponse.json(cached, { headers: { "x-orin-cache": "HIT" } });
  }
  console.log(
    `[cache MISS] ${cik.ticker} ${filing.form} ${filing.accessionNumber} — running full analysis`,
  );

  // --- EXPENSIVE step (only on a miss): extract numbers + write the summary.
  // Logic is unchanged from before; caching only decides whether we run it. ---
  let snapshot;
  try {
    snapshot = await buildSnapshot(cik, filing);
  } catch (err) {
    console.error(`snapshot build failed: ${err instanceof Error ? err.message : String(err)}`);
    return NextResponse.json(
      { ok: false, message: ERROR_MESSAGES["edgar-unavailable"] },
      { status: 502 },
    );
  }

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

  return NextResponse.json(payload, { headers: { "x-orin-cache": "MISS" } });
}
