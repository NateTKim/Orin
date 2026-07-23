// Ad-hoc test harness for the Business Health score. Fetches real snapshots
// from the running dev server's API and runs the REAL scorer on them, so we're
// testing the shipping code against live EDGAR data. Not part of the app.
//
// Run:  node --experimental-strip-types scripts/health-check.ts AAPL RIVN JPM WMT

import { computeBusinessHealth } from "../lib/health/score.ts";
import type { FilingApiResponse } from "../lib/api-types.ts";

const tickers = process.argv.slice(2);
if (tickers.length === 0) tickers.push("AAPL", "RIVN", "JPM", "WMT", "KO");

const arrow = (d: string) => (d === "up" ? "↑" : d === "down" ? "↓" : "→");

for (const t of tickers) {
  try {
    const res = await fetch(`http://localhost:3000/api/filing/${t}`);
    const data = (await res.json()) as FilingApiResponse;
    if (!data.ok) {
      console.log(`\n=== ${t} ===\n  API error: ${data.message}`);
      continue;
    }
    const s = data.snapshot;
    const h = computeBusinessHealth(s);
    console.log(`\n=== ${t} — ${s.companyName} (${s.form}, ${s.historyKind}, ${s.history.length}pts) ===`);
    if (!h.available) {
      console.log("  NOT ENOUGH DATA to assess");
      continue;
    }
    console.log(`  SCORE ${h.score}/10 — ${h.label}`);
    console.log(`  WHY: ${h.why}`);
    for (const f of h.factors) {
      console.log(`    ${arrow(f.direction)} ${f.label.padEnd(16)} [${f.sentiment.padEnd(8)}] ${f.detail}`);
    }
    // Echo the raw drivers so the score is auditable against sec.gov.
    const m = s.metrics;
    const fmt = (x: number | null) => (x === null ? "n/a" : x.toLocaleString());
    console.log(
      `  raw: rev ${fmt(m.revenue.value)} (yoy ${m.revenue.yoyPct?.toFixed(3) ?? "n/a"}), ` +
        `ni ${fmt(m.netIncome.value)} (prior ${fmt(m.netIncome.priorValue)}), ` +
        `opInc ${fmt(m.operatingIncome.value)} (prior ${fmt(m.operatingIncome.priorValue)}), ` +
        `gm ${m.grossMarginPct.value?.toFixed(3) ?? "n/a"} (Δ ${m.grossMarginPct.yoyPct?.toFixed(3) ?? "n/a"}), ` +
        `liab/assets ${m.totalLiabilities.value !== null && m.totalAssets.value ? (m.totalLiabilities.value / m.totalAssets.value).toFixed(2) : "n/a"}`,
    );
  } catch (e) {
    console.log(`\n=== ${t} ===\n  threw: ${e instanceof Error ? e.message : String(e)}`);
  }
}
