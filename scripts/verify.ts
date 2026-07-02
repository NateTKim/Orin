// Exit-test cross-check: for each ticker, extract the FilingSnapshot, then
// fetch the ACTUAL filing document from sec.gov and confirm every extracted
// figure appears in it as presented (millions/thousands, parens for
// negatives). Catches wrong-period or wrong-tag extractions.
//   node --env-file=.env.local scripts/verify.ts AAPL JPM WMT RIVN O

import { fetchEdgarText } from "../lib/edgar/client.ts";
import { getFilingSnapshot } from "../lib/edgar/snapshot.ts";
import type { MetricValue } from "../lib/edgar/types.ts";

function withCommas(n: number): string {
  return n.toLocaleString("en-US");
}

/** Every string form a filing might use for this value. */
function candidateStrings(value: number, isPerShare: boolean): string[] {
  const out: string[] = [];
  const abs = Math.abs(value);
  if (isPerShare) {
    const s = abs.toFixed(2);
    out.push(s, `(${s})`, `(${s}`);
  } else {
    for (const scale of [1, 1_000, 1_000_000]) {
      if (abs % scale !== 0) continue;
      const s = withCommas(abs / scale);
      out.push(s, `(${s})`, `(${s}`);
    }
  }
  return out;
}

function checkMetric(name: string, m: MetricValue, doc: string): string[] {
  const problems: string[] = [];
  const isPerShare = m.unit === "USD/shares";
  for (const [label, v] of [
    ["value", m.value],
    ["priorValue", m.priorValue],
  ] as const) {
    if (v === null) continue;
    const found = candidateStrings(v, isPerShare).some((s) => doc.includes(s));
    if (!found) problems.push(`${name}.${label} = ${v} NOT found in filing document`);
  }
  return problems;
}

const tickers = process.argv.slice(2);
let anyFailure = false;

for (const ticker of tickers) {
  const result = await getFilingSnapshot(ticker);
  if (!result.ok) {
    console.log(`${ticker}: PIPELINE FAILED (${result.reason}) ${result.detail}`);
    anyFailure = true;
    continue;
  }
  const snap = result.snapshot;
  const doc = await fetchEdgarText(snap.filingUrl);

  const problems: string[] = [];
  const { metrics } = snap;
  problems.push(...checkMetric("revenue", metrics.revenue, doc));
  problems.push(...checkMetric("netIncome", metrics.netIncome, doc));
  problems.push(...checkMetric("dilutedEps", metrics.dilutedEps, doc));
  problems.push(...checkMetric("operatingIncome", metrics.operatingIncome, doc));
  problems.push(...checkMetric("totalAssets", metrics.totalAssets, doc));
  problems.push(...checkMetric("totalLiabilities", metrics.totalLiabilities, doc));

  const reported = Object.entries(metrics)
    .filter(([, m]) => m.value !== null)
    .map(([k]) => k);
  const missing = Object.entries(metrics)
    .filter(([, m]) => m.value === null)
    .map(([k]) => k);

  if (problems.length === 0) {
    console.log(
      `${ticker}: OK — ${snap.form} ${snap.periodEnd}; verified ${reported.length} metrics ` +
        `against ${snap.filingUrl}` +
        (missing.length ? `; not reported: ${missing.join(", ")}` : ""),
    );
  } else {
    anyFailure = true;
    console.log(`${ticker}: MISMATCH — ${snap.form} ${snap.periodEnd}`);
    for (const p of problems) console.log(`  - ${p}`);
  }
}
process.exit(anyFailure ? 1 : 0);
