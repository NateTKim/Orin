import { NextResponse } from "next/server";
import { getFilingSnapshot } from "@/lib/edgar/snapshot.ts";
import { summarizeFiling } from "@/lib/summarize.ts";
import type { FilingApiResponse } from "@/lib/api-types.ts";

// EDGAR fetches + the Claude call take well over the default function
// timeout; give the Vercel function the full minute.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const TICKER_RE = /^[A-Za-z][A-Za-z.\-]{0,9}$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticker: string }> },
): Promise<NextResponse<FilingApiResponse>> {
  const { ticker } = await params;

  if (!TICKER_RE.test(ticker.trim())) {
    return NextResponse.json(
      { ok: false, message: "That doesn't look like a stock ticker. Try something like AAPL." },
      { status: 400 },
    );
  }

  const result = await getFilingSnapshot(ticker.trim());
  if (!result.ok) {
    // Server-side only: the user sees the friendly message below.
    console.error(`filing lookup failed [${result.reason}]: ${result.detail}`);
    const message = {
      "ticker-not-found": `We couldn't find "${ticker.trim().toUpperCase()}" in SEC EDGAR. Check the ticker and try again.`,
      "no-recent-filing": "This company has no 10-Q or 10-K on file with the SEC.",
      "edgar-unavailable": "SEC EDGAR isn't responding right now. Please try again in a moment.",
    }[result.reason];
    const status = result.reason === "edgar-unavailable" ? 502 : 404;
    return NextResponse.json({ ok: false, message }, { status });
  }

  // The numbers are the product; a summary failure must not sink the response.
  let summary: string | null = null;
  let summaryNote: string | null = null;
  const summaryResult = await summarizeFiling(result.snapshot);
  if (summaryResult.error) {
    summaryNote = "The plain-English summary is temporarily unavailable.";
  } else if (summaryResult.inventedNumberWarnings.length > 0) {
    // Never show a summary containing a number we didn't extract.
    summaryNote =
      "The summary was withheld because it failed our accuracy check. The figures above come directly from the SEC filing.";
  } else {
    summary = summaryResult.summary;
  }

  return NextResponse.json({ ok: true, snapshot: result.snapshot, summary, summaryNote });
}
