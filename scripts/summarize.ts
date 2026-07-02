// Phase 1 step 6 runner: extraction + LLM summary end-to-end.
//   node --env-file=.env.local scripts/summarize.ts AAPL [MORE TICKERS...]

import { getFilingSnapshot } from "../lib/edgar/snapshot.ts";
import { summarizeFiling } from "../lib/summarize.ts";

const tickers = process.argv.slice(2);
if (tickers.length === 0) {
  console.error("Usage: node --env-file=.env.local scripts/summarize.ts <TICKER> [TICKER...]");
  process.exit(1);
}

let failures = 0;
for (const ticker of tickers) {
  console.log(`\n========== ${ticker.toUpperCase()} ==========`);
  const result = await getFilingSnapshot(ticker);
  if (!result.ok) {
    failures++;
    console.log(`EXTRACTION FAILED (${result.reason}): ${result.detail}`);
    continue;
  }
  const snap = result.snapshot;
  console.log(`${snap.companyName} — ${snap.form} for period ended ${snap.periodEnd}`);
  console.log(`Source: ${snap.filingUrl}\n`);

  const summary = await summarizeFiling(snap);
  if (summary.error) {
    failures++;
    console.log(`SUMMARY FAILED: ${summary.error}`);
    continue;
  }
  console.log(summary.summary);
  if (summary.inventedNumberWarnings.length > 0) {
    failures++;
    console.log(
      `\n!! INVENTED-NUMBER WARNINGS: ${summary.inventedNumberWarnings.join(", ")}`,
    );
  } else {
    console.log("\n[invented-number check: clean]");
  }
}
process.exit(failures > 0 ? 1 : 0);
