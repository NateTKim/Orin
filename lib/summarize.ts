// LLM summary layer. The Claude API writes prose AROUND numbers extracted
// from EDGAR — it must never generate, estimate, or infer a figure itself.
// Every number the model may use is pre-formatted here and passed in the
// prompt; checkForInventedNumbers() flags anything outside that set.

import Anthropic from "@anthropic-ai/sdk";
import { getFilingText } from "./edgar/document.ts";
import { formatPct, formatPerShare, formatUsd } from "./format.ts";
import type { FilingSnapshot, MetricValue } from "./edgar/types.ts";

const MODEL = "claude-sonnet-4-6";

export interface SummaryResult {
  /** Plain-English summary; empty string means summarization failed. */
  summary: string;
  /** Numbers found in the summary that were NOT passed into the prompt. */
  inventedNumberWarnings: string[];
  error: string | null;
}

// ---------------------------------------------------------------------------
// Build the set of figures the model is allowed to use, pre-formatted.
// ---------------------------------------------------------------------------

interface AllowedFigures {
  lines: string[];
  /** Every formatted figure string handed to the model, for post-checking. */
  allowed: string[];
}

function metricLines(
  label: string,
  m: MetricValue,
  fmt: (v: number) => string,
  figures: AllowedFigures,
): void {
  if (m.value === null) {
    figures.lines.push(`- ${label}: not reported`);
    return;
  }
  let line = `- ${label}: ${fmt(m.value)}`;
  figures.allowed.push(fmt(m.value));
  if (m.priorValue !== null) {
    line += ` (same period last year: ${fmt(m.priorValue)}`;
    figures.allowed.push(fmt(m.priorValue));
    if (m.yoyPct !== null) {
      line += `, ${formatPct(m.yoyPct)} year over year`;
      figures.allowed.push(formatPct(m.yoyPct));
    }
    line += ")";
  }
  figures.lines.push(line);
}

function buildFigures(snapshot: FilingSnapshot): AllowedFigures {
  const figures: AllowedFigures = { lines: [], allowed: [] };
  const { metrics } = snapshot;
  metricLines("Revenue", metrics.revenue, formatUsd, figures);
  metricLines("Net income", metrics.netIncome, formatUsd, figures);
  metricLines("Diluted EPS", metrics.dilutedEps, formatPerShare, figures);
  metricLines("Operating income", metrics.operatingIncome, formatUsd, figures);
  // Gross margin is a fraction; format value/prior as unsigned percentages.
  const gm = metrics.grossMarginPct;
  if (gm.value === null) {
    figures.lines.push("- Gross margin: not reported");
  } else {
    const cur = formatPct(gm.value, false);
    figures.allowed.push(cur);
    let line = `- Gross margin: ${cur}`;
    if (gm.priorValue !== null) {
      const prior = formatPct(gm.priorValue, false);
      figures.allowed.push(prior);
      line += ` (same period last year: ${prior}`;
      if (gm.yoyPct !== null) {
        // Point delta computed in extraction, so the model never derives it.
        const sign = gm.yoyPct > 0 ? "+" : "";
        const pts = `${sign}${(gm.yoyPct * 100).toFixed(1)} percentage points`;
        figures.allowed.push(pts);
        line += `, a change of ${pts}`;
      }
      line += ")";
    }
    figures.lines.push(line);
  }
  metricLines("Total assets", metrics.totalAssets, formatUsd, figures);
  metricLines("Total liabilities", metrics.totalLiabilities, formatUsd, figures);
  return figures;
}

// ---------------------------------------------------------------------------
// Filing text: section-aware extraction lives in lib/edgar/document.ts
// (full risk factors + MD&A weighted to its later sections + closing notes).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Invented-number check
// ---------------------------------------------------------------------------

/**
 * Flag numeric tokens in the summary that appear NOWHERE in the input — not
 * in the pre-formatted figures, not in the filing excerpt (product names
 * like "iPhone 17e" live there), not in the snapshot dates. Anything flagged
 * is a number the model made up.
 */
export function checkForInventedNumbers(
  summary: string,
  allowedFigures: string[],
  snapshot: FilingSnapshot,
  filingExcerpt: string,
): string[] {
  const allowedText =
    allowedFigures.join(" ") +
    ` ${filingExcerpt}` +
    ` ${snapshot.periodEnd} ${snapshot.filedDate} 10-Q 10-K ${snapshot.cik}`;
  // Normalize away thousands separators so "4,900.48" matches "4900.48".
  const normalize = (t: string) => t.replace(/[.,]$/, "").replace(/,/g, "");
  const allowedTokens = new Set(
    (allowedText.match(/\d[\d,.]*/g) ?? []).map(normalize),
  );

  const warnings: string[] = [];
  for (const token of summary.match(/\d[\d,.]*/g) ?? []) {
    const clean = normalize(token);
    if (allowedTokens.has(clean)) continue;
    // Years and small counts ("the quarter", "three months") are fine.
    const n = Number(clean.replace(/,/g, ""));
    if (Number.isInteger(n) && ((n >= 1990 && n <= 2100) || n <= 12)) continue;
    warnings.push(clean);
  }
  return [...new Set(warnings)];
}

// ---------------------------------------------------------------------------
// The summary call
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You write plain-English summaries of SEC filings for everyday beginner investors — people who have never read a filing and may not know finance words.

Write simply (roughly an 8th-grade reading level): short sentences, everyday words, no jargon. When a financial term is unavoidable, explain it in a few plain words in parentheses the first time you use it — e.g. "diluted EPS (profit earned per share)", "operating income (profit from day-to-day business)". Say "money the company brought in" rather than "top-line performance". Never talk down to the reader; just be clear.

HARD RULES — these override everything else:
1. You may ONLY use the financial figures provided in the "EXTRACTED FIGURES" section, copied EXACTLY as written there (same formatting, same rounding). Never generate, estimate, derive, round differently, or infer any number — no computing changes, ratios, or totals yourself. In particular, NEVER state a dollar-amount change (e.g. "grew by $12 billion") and NEVER state a ratio or multiple you computed (e.g. "2.5 times faster") — describe changes only with the provided year-over-year percentages, or in qualitative words ("faster than", "roughly double").
2. If a figure says "not reported", say it was not reported (when relevant) — never fill in a value.
3. The FILING TEXT sections are context for the company's own narrative. You may describe what management discusses, but you must not quote or use any NUMBER from them — numbers come only from EXTRACTED FIGURES. Where text was omitted (marked "[... omitted ...]"), never guess at what it said.
4. No investment advice, no price targets, no speculation about the stock.

Output format (PLAIN TEXT ONLY — no markdown, no asterisks, no # headers):
- Two short paragraphs of plain-English summary: what the company reported this period and how the business performed, in words a non-expert understands. Separate paragraphs with a blank line.
- Then a line containing exactly "Notable changes" followed by 2-4 bullet lines, each starting with "- ", about the year-over-year moves, using only the provided figures.
- Then a line containing exactly "What management may be downplaying" followed by 2-3 bullet lines, each starting with "- ". These are careful, qualitative observations drawn ONLY from the filing text sections (risk factors, MD&A, notes): risks or headwinds management mentions briefly or in softened language, caveats buried late in the discussion or in the notes, or unfavorable trends given little airtime. Prefer what is SPECIFIC to this company and this period — a named lawsuit or investigation, a customer or supplier concentration, debt or covenant pressure, a segment quietly deteriorating, a new risk factor that wasn't boilerplate — over generic risks that appear in every filing (competition, macro conditions, "our stock price may fluctuate"). Hedge appropriately ("may", "appears"), never accuse, and use no numbers (rule 1 still applies). If nothing stands out, output a single bullet: "- Nothing in this filing's discussion stood out as being played down."`;

export async function summarizeFiling(
  snapshot: FilingSnapshot,
): Promise<SummaryResult> {
  try {
    const figures = buildFigures(snapshot);
    const { promptText: filingText } = await getFilingText(snapshot.filingUrl);

    const userMessage = `Company: ${snapshot.companyName} (${snapshot.ticker})
Filing: ${snapshot.form} for the fiscal period ended ${snapshot.periodEnd}, filed ${snapshot.filedDate}

EXTRACTED FIGURES (the only numbers you may use, verbatim):
${figures.lines.join("\n")}

FILING TEXT (context only — do not use numbers from it):
${filingText}`;

    const client = new Anthropic();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const summary = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
    if (!summary) {
      return {
        summary: "",
        inventedNumberWarnings: [],
        error: `Model returned no text (stop_reason: ${response.stop_reason}).`,
      };
    }

    return {
      summary,
      inventedNumberWarnings: checkForInventedNumbers(summary, figures.allowed, snapshot, filingText),
      error: null,
    };
  } catch (err) {
    return {
      summary: "",
      inventedNumberWarnings: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
