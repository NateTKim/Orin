// Synthetic edge-case checks for the health scorer (no network). Confirms the
// "not enough data" guard and the low end of the scale that live large-caps
// don't exercise. Run: node --experimental-strip-types scripts/health-synthetic.ts
import { computeBusinessHealth } from "../lib/health/score.ts";
import type { FilingSnapshot, MetricValue } from "../lib/edgar/types.ts";

const M = (value: number | null, priorValue: number | null = null, yoyPct: number | null = null): MetricValue => ({
  value, priorValue, yoyPct, tag: "test", unit: "USD",
});

function snap(over: Partial<FilingSnapshot["metrics"]>, history: FilingSnapshot["history"] = [], kind: "quarterly" | "annual" = "quarterly"): FilingSnapshot {
  return {
    ticker: "TST", companyName: "Test Co", cik: "0", form: "10-Q", accessionNumber: "x",
    periodEnd: "2026-03-31", filedDate: "2026-05-01", filingUrl: "x",
    metrics: {
      revenue: M(null), netIncome: M(null), dilutedEps: M(null), operatingIncome: M(null),
      grossMarginPct: M(null), totalAssets: M(null), totalLiabilities: M(null), ...over,
    },
    history, historyKind: kind,
  };
}
const hist = (vals: number[]) => vals.map((revenue, i) => ({ periodEnd: `20${20 + i}-03-31`, revenue, eps: null, revenueDerived: false }));

const cases: Array<[string, FilingSnapshot]> = [
  // Newly public: no prior-year revenue → can't compute growth → not enough data.
  ["Newly public (no prior revenue)", snap({ revenue: M(1000, null, null), netIncome: M(-50, null, null) })],
  // Only revenue present, nothing else → fewer than 3 signals → not enough data.
  ["Sparse (revenue only)", snap({ revenue: M(1000, 900, 0.11) })],
  // Clear decline: revenue down, losses widening, margins compressing, high debt.
  ["Deteriorating business", snap(
    { revenue: M(800, 1000, -0.2), netIncome: M(-300, -100, -2.0), operatingIncome: M(-250, -80, null),
      grossMarginPct: M(0.10, 0.18, -0.08), totalAssets: M(1000, 1200), totalLiabilities: M(980, 1050) },
    hist([1000, 980, 950, 900, 880, 850, 820, 800]),
  )],
];

const arrow = (d: string) => (d === "up" ? "↑" : d === "down" ? "↓" : "→");
for (const [name, s] of cases) {
  const h = computeBusinessHealth(s);
  console.log(`\n=== ${name} ===`);
  if (!h.available) { console.log("  → NOT ENOUGH DATA (honest null state)"); continue; }
  console.log(`  SCORE ${h.score}/10 — ${h.label}`);
  console.log(`  WHY: ${h.why}`);
  for (const f of h.factors) console.log(`    ${arrow(f.direction)} ${f.label} [${f.sentiment}] ${f.detail}`);
}
// Determinism: same input twice → identical output.
const a = JSON.stringify(computeBusinessHealth(cases[2][1]));
const b = JSON.stringify(computeBusinessHealth(cases[2][1]));
console.log(`\nDeterministic: ${a === b ? "PASS (identical)" : "FAIL"}`);

// --- Profitability floor: STRUCTURAL enforcement ---------------------------
// Build a company with EVERY other signal maxed — +40% revenue, four straight
// up quarters, +6pt margins, growing operating profit, low/falling debt — and
// vary ONLY the net-income trajectory. Widening losses must be capped out of
// "Steady"/"Strengthening" no matter how strong everything else is; flipping
// the SAME company to narrowing losses proves the cap is what did it.
console.log("\n=== Profitability floor (adversarial) ===");
const strongExcept = (niValue: number, niPrior: number) =>
  snap(
    {
      revenue: M(1400, 1000, 0.4),
      netIncome: M(niValue, niPrior, null),
      operatingIncome: M(500, 300, null),
      grossMarginPct: M(0.5, 0.44, 0.06),
      totalAssets: M(1000, 900),
      totalLiabilities: M(300, 300),
    },
    hist([700, 800, 900, 1000, 1100, 1200, 1300, 1400]),
  );

const widening = computeBusinessHealth(strongExcept(-200, -80)); // loss widening
const narrowing = computeBusinessHealth(strongExcept(-80, -200)); // loss narrowing
console.log(`  everything strong, LOSS WIDENING → ${widening.score}/10 ${widening.label}`);
console.log(`  everything strong, LOSS NARROWING → ${narrowing.score}/10 ${narrowing.label}`);
const floorHeld =
  widening.score !== null &&
  widening.score <= 5 &&
  widening.label !== "Steady" &&
  widening.label !== "Strengthening";
console.log(`  FLOOR HOLDS (widening capped ≤5, never Steady/Strengthening): ${floorHeld ? "PASS" : "FAIL"}`);
console.log(
  `  cap is the cause (same company scores >5 when losses narrow): ${
    narrowing.score !== null && narrowing.score > 5 ? "PASS" : "FAIL"
  }`,
);
// Swing-into-loss is also "worsening" and must be capped.
const swung = computeBusinessHealth(strongExcept(-50, 300)); // was profitable → loss
console.log(`  everything strong, SWUNG TO A LOSS → ${swung.score}/10 ${swung.label}`);
console.log(
  `  swing-to-loss capped: ${
    swung.score !== null && swung.score <= 5 && swung.label !== "Steady" ? "PASS" : "FAIL"
  }`,
);
