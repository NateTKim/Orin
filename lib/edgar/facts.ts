import { fetchEdgarJson } from "./client.ts";
import type {
  CompanyFactsResponse,
  FilingRef,
  MetricValue,
  XbrlConcept,
  XbrlFact,
} from "./types.ts";

export async function getCompanyFacts(cik: string): Promise<CompanyFactsResponse> {
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
  return fetchEdgarJson<CompanyFactsResponse>(url);
}

// ---------------------------------------------------------------------------
// Ordered fallback tag lists. Concept naming varies by company; we try each
// tag in order and use the first one that has a fact for the target period.
// The tag that matched is recorded on the MetricValue for verification.
// ---------------------------------------------------------------------------

const REVENUE_TAGS = [
  // Income-statement total when tagged (banks, REITs, retailers with
  // membership income); falls back to ASC 606 contract revenue (AAPL, RIVN).
  "Revenues",
  // Banks: "total net revenue" (interest + noninterest income, net of
  // interest expense) — e.g. JPM tags only this concept.
  "RevenuesNetOfInterestExpense",
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "RevenueFromContractWithCustomerIncludingAssessedTax",
  "SalesRevenueNet",
  "SalesRevenueGoodsNet",
];

const NET_INCOME_TAGS = [
  "NetIncomeLoss",
  // Preferred over ProfitLoss when NetIncomeLoss is absent: it's the figure
  // EPS is computed on (e.g. Realty Income tags only these two, and
  // ProfitLoss includes noncontrolling interests).
  "NetIncomeLossAvailableToCommonStockholdersBasic",
  "ProfitLoss",
];

const DILUTED_EPS_TAGS = ["EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted"];

const OPERATING_INCOME_TAGS = ["OperatingIncomeLoss"];

const GROSS_PROFIT_TAGS = ["GrossProfit"];

const COST_OF_REVENUE_TAGS = [
  "CostOfRevenue",
  "CostOfGoodsAndServicesSold",
  "CostOfGoodsSold",
  "CostOfSales",
];

const TOTAL_ASSETS_TAGS = ["Assets"];
const TOTAL_LIABILITIES_TAGS = ["Liabilities"];

// ---------------------------------------------------------------------------
// Period matching
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(startIso: string, endIso: string): number {
  return Math.round((Date.parse(endIso) - Date.parse(startIso)) / DAY_MS);
}

/**
 * A 10-Q's headline flows cover ~1 quarter; a 10-K's cover ~1 fiscal year.
 * Windows are generous to cover 52/53-week fiscal calendars (e.g. WMT, AAPL).
 */
function durationMatches(fact: XbrlFact, form: "10-Q" | "10-K"): boolean {
  if (!fact.start) return false;
  const days = daysBetween(fact.start, fact.end);
  return form === "10-Q" ? days >= 75 && days <= 105 : days >= 340 && days <= 390;
}

/** Prior-year comparison period: ends ~12 months before the current period end. */
function isPriorYearEnd(currentEnd: string, candidateEnd: string): boolean {
  const days = daysBetween(candidateEnd, currentEnd);
  return days >= 330 && days <= 400;
}

interface FactMatch {
  fact: XbrlFact;
  tag: string;
  unit: string;
}

/**
 * Facts for the same period recur across filings (original + comparatives in
 * later filings + amendments). De-dupe by taking the most recently filed one,
 * which reflects any restatement.
 */
function mostRecentlyFiled(candidates: XbrlFact[]): XbrlFact | null {
  if (candidates.length === 0) return null;
  return candidates.reduce((best, f) => (f.filed > best.filed ? f : best));
}

function findFlowFact(
  concepts: Record<string, XbrlConcept>,
  tags: string[],
  units: string[],
  filing: FilingRef,
): FactMatch | null {
  for (const tag of tags) {
    const concept = concepts[tag];
    if (!concept) continue;
    for (const unit of units) {
      const facts = concept.units[unit];
      if (!facts) continue;
      const candidates = facts.filter(
        (f) => f.end === filing.reportDate && durationMatches(f, filing.form),
      );
      const fact = mostRecentlyFiled(candidates);
      if (fact) return { fact, tag, unit };
    }
  }
  return null;
}

function findInstantFact(
  concepts: Record<string, XbrlConcept>,
  tags: string[],
  filing: FilingRef,
): FactMatch | null {
  for (const tag of tags) {
    const concept = concepts[tag];
    if (!concept) continue;
    const facts = concept.units["USD"];
    if (!facts) continue;
    const candidates = facts.filter((f) => !f.start && f.end === filing.reportDate);
    const fact = mostRecentlyFiled(candidates);
    if (fact) return { fact, tag, unit: "USD" };
  }
  return null;
}

/** Prior-year value for the SAME tag/unit as the current match, for comparability. */
function findPriorYearFact(
  concepts: Record<string, XbrlConcept>,
  match: FactMatch,
  filing: FilingRef,
): XbrlFact | null {
  const facts = concepts[match.tag]?.units[match.unit];
  if (!facts) return null;
  const candidates = facts.filter(
    (f) => isPriorYearEnd(filing.reportDate, f.end) && durationMatches(f, filing.form),
  );
  return mostRecentlyFiled(candidates);
}

// ---------------------------------------------------------------------------
// Metric assembly
// ---------------------------------------------------------------------------

const NOT_REPORTED: MetricValue = {
  value: null,
  priorValue: null,
  yoyPct: null,
  tag: null,
  unit: null,
};

function yoy(current: number, prior: number | null): number | null {
  if (prior === null || prior === 0) return null;
  return (current - prior) / Math.abs(prior);
}

function buildMetric(
  concepts: Record<string, XbrlConcept>,
  tags: string[],
  units: string[],
  filing: FilingRef,
  kind: "flow" | "instant",
): MetricValue {
  const match =
    kind === "flow"
      ? findFlowFact(concepts, tags, units, filing)
      : findInstantFact(concepts, tags, filing);
  if (!match) return NOT_REPORTED;
  // No YoY for balance-sheet (instant) items: filings compare those against
  // the prior fiscal YEAR-END, not the year-ago quarter, so a year-ago
  // comparison wouldn't match what the filing presents.
  const prior = kind === "flow" ? findPriorYearFact(concepts, match, filing) : null;
  return {
    value: match.fact.val,
    priorValue: prior ? prior.val : null,
    yoyPct: yoy(match.fact.val, prior ? prior.val : null),
    tag: match.tag,
    unit: match.unit,
  };
}

/**
 * Gross margin as a fraction of revenue, derived only from reported facts:
 * GrossProfit / revenue when GrossProfit is tagged, else
 * (revenue - cost of revenue) / revenue. Null when not derivable (banks,
 * REITs and others that don't report a cost-of-revenue concept).
 * yoyPct holds the percentage-POINT change vs prior year (0.02 = +2pts).
 */
function deriveGrossMargin(
  concepts: Record<string, XbrlConcept>,
  revenue: MetricValue,
  filing: FilingRef,
): MetricValue {
  if (revenue.value === null || revenue.value === 0) return NOT_REPORTED;

  const grossProfit = buildMetric(concepts, GROSS_PROFIT_TAGS, ["USD"], filing, "flow");
  let profitNow: number | null = null;
  let profitPrior: number | null = null;
  let tag: string | null = null;

  if (grossProfit.value !== null) {
    profitNow = grossProfit.value;
    profitPrior = grossProfit.priorValue;
    tag = grossProfit.tag;
  } else {
    const cost = buildMetric(concepts, COST_OF_REVENUE_TAGS, ["USD"], filing, "flow");
    if (cost.value !== null) {
      profitNow = revenue.value - cost.value;
      profitPrior =
        revenue.priorValue !== null && cost.priorValue !== null
          ? revenue.priorValue - cost.priorValue
          : null;
      tag = `${revenue.tag} - ${cost.tag}`;
    }
  }

  if (profitNow === null) return NOT_REPORTED;
  const margin = profitNow / revenue.value;
  const priorMargin =
    profitPrior !== null && revenue.priorValue !== null && revenue.priorValue !== 0
      ? profitPrior / revenue.priorValue
      : null;
  return {
    value: margin,
    priorValue: priorMargin,
    yoyPct: priorMargin !== null ? margin - priorMargin : null,
    tag,
    unit: "fraction",
  };
}

export interface ExtractedMetrics {
  revenue: MetricValue;
  netIncome: MetricValue;
  dilutedEps: MetricValue;
  operatingIncome: MetricValue;
  grossMarginPct: MetricValue;
  totalAssets: MetricValue;
  totalLiabilities: MetricValue;
}

/** Extract all headline metrics for the period covered by `filing`. */
export function extractMetrics(
  factsResponse: CompanyFactsResponse,
  filing: FilingRef,
): ExtractedMetrics {
  const concepts = factsResponse.facts["us-gaap"] ?? {};

  const revenue = buildMetric(concepts, REVENUE_TAGS, ["USD"], filing, "flow");
  return {
    revenue,
    netIncome: buildMetric(concepts, NET_INCOME_TAGS, ["USD"], filing, "flow"),
    dilutedEps: buildMetric(concepts, DILUTED_EPS_TAGS, ["USD/shares"], filing, "flow"),
    operatingIncome: buildMetric(concepts, OPERATING_INCOME_TAGS, ["USD"], filing, "flow"),
    grossMarginPct: deriveGrossMargin(concepts, revenue, filing),
    totalAssets: buildMetric(concepts, TOTAL_ASSETS_TAGS, ["USD"], filing, "instant"),
    totalLiabilities: buildMetric(concepts, TOTAL_LIABILITIES_TAGS, ["USD"], filing, "instant"),
  };
}
