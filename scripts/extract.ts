// Standalone Phase 1 pipeline runner:
//   node --env-file=.env.local scripts/extract.ts AAPL [MORE TICKERS...]
// Prints each FilingSnapshot as readable JSON for manual verification.

import { getFilingSnapshot } from "../lib/edgar/snapshot.ts";

const tickers = process.argv.slice(2);
if (tickers.length === 0) {
  console.error("Usage: node --env-file=.env.local scripts/extract.ts <TICKER> [TICKER...]");
  process.exit(1);
}

let failures = 0;
for (const ticker of tickers) {
  console.log(`\n===== ${ticker.toUpperCase()} =====`);
  const result = await getFilingSnapshot(ticker);
  if (result.ok) {
    console.log(JSON.stringify(result.snapshot, null, 2));
  } else {
    failures++;
    console.log(`FAILED (${result.reason}): ${result.detail}`);
  }
}
process.exit(failures > 0 ? 1 : 0);
