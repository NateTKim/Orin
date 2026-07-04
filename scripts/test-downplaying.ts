// Exercises the section-aware filing-text extraction and (optionally) the
// full summary, printing the "What management may be downplaying" output.
//   node --env-file=.env.local scripts/test-downplaying.ts AAPL RIVN JPM
//   node --env-file=.env.local scripts/test-downplaying.ts --parse-only AAPL

import { getFilingText } from "../lib/edgar/document.ts";
import { getFilingSnapshot } from "../lib/edgar/snapshot.ts";
import { summarizeFiling } from "../lib/summarize.ts";

const args = process.argv.slice(2);
const parseOnly = args.includes("--parse-only");
const tickers = args.filter((a) => !a.startsWith("--"));

for (const ticker of tickers) {
  console.log(`\n========== ${ticker.toUpperCase()} ==========`);
  const result = await getFilingSnapshot(ticker);
  if (!result.ok) {
    console.log(`extraction failed: ${result.detail}`);
    continue;
  }
  const snap = result.snapshot;
  console.log(`${snap.form} · period ended ${snap.periodEnd} · ${snap.filingUrl}`);

  const { promptText, diagnostics } = await getFilingText(snap.filingUrl);
  for (const d of diagnostics) {
    console.log(
      `  ${d.section.padEnd(12)} ${d.found ? `found (${d.how})` : "NOT FOUND"}  full=${d.fullChars.toLocaleString()} sent=${d.sentChars.toLocaleString()}`,
    );
  }
  console.log(`  total prompt text: ${promptText.length.toLocaleString()} chars`);

  if (parseOnly) continue;

  const summary = await summarizeFiling(snap);
  if (summary.error) {
    console.log(`SUMMARY FAILED: ${summary.error}`);
    continue;
  }
  const idx = summary.summary.indexOf("What management may be downplaying");
  console.log(
    idx >= 0 ? `\n${summary.summary.slice(idx)}` : "\n(downplaying section missing!)",
  );
  console.log(
    summary.inventedNumberWarnings.length
      ? `!! invented-number warnings: ${summary.inventedNumberWarnings.join(", ")}`
      : "[invented-number check: clean]",
  );
}
