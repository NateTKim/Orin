// LLM summary layer. The Claude API writes prose AROUND numbers extracted
// from EDGAR — it must never generate, estimate, or infer a figure itself.
// Every number the model may use is pre-formatted here and passed in the
// prompt; checkForInventedNumbers() flags anything outside that set.

import Anthropic from "@anthropic-ai/sdk";
import { fetchEdgarText } from "./edgar/client.ts";
import { formatPct, formatPerShare, formatUsd } from "./format.ts";
import type { FilingSnapshot, MetricValue } from "./edgar/types.ts";

const MODEL = "claude-sonnet-4-6";
const MDNA_EXCERPT_CHARS = 12000;

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
// MD&A excerpt from the actual filing document
// ---------------------------------------------------------------------------

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Best-effort excerpt of the MD&A section. The heading appears in the table
 * of contents first and at the section itself later, so we take the LAST
 * occurrence. Falls back to the start of the document text.
 */
export async function getMdnaExcerpt(filingUrl: string): Promise<string> {
  const html = await fetchEdgarText(filingUrl);
  const text = htmlToText(html);
  const needle = "management's discussion and analysis";
  const idx = text.toLowerCase().lastIndexOf(needle);
  const start = idx >= 0 ? idx : 0;
  return text.slice(start, start + MDNA_EXCERPT_CHARS);
}

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

const SYSTEM_PROMPT = `You write plain-English summaries of SEC filings for retail investors.

HARD RULES — these override everything else:
1. You may ONLY use the financial figures provided in the "EXTRACTED FIGURES" section, copied EXACTLY as written there (same formatting, same rounding). Never generate, estimate, derive, round differently, or infer any number — no computing changes, ratios, or totals yourself. In particular, NEVER state a dollar-amount change (e.g. "grew by $12 billion") and NEVER state a ratio or multiple you computed (e.g. "2.5 times faster") — describe changes only with the provided year-over-year percentages, or in qualitative words ("faster than", "roughly double").
2. If a figure says "not reported", say it was not reported (when relevant) — never fill in a value.
3. The filing excerpt is context for the company's own narrative. You may describe what management discusses, but you must not quote or use any NUMBER from the excerpt — numbers come only from EXTRACTED FIGURES.
4. No investment advice, no price targets, no speculation about the stock.

Output format (PLAIN TEXT ONLY — no markdown, no asterisks, no # headers):
- Two short paragraphs of plain-English summary: what the company reported this period and how the business performed, in words a non-expert understands. Separate paragraphs with a blank line.
- Then a line containing exactly "Notable changes" followed by 2-4 bullet lines, each starting with "- ", about the year-over-year moves, using only the provided figures.`;

export async function summarizeFiling(
  snapshot: FilingSnapshot,
): Promise<SummaryResult> {
  try {
    const figures = buildFigures(snapshot);
    const mdna = await getMdnaExcerpt(snapshot.filingUrl);

    const userMessage = `Company: ${snapshot.companyName} (${snapshot.ticker})
Filing: ${snapshot.form} for the fiscal period ended ${snapshot.periodEnd}, filed ${snapshot.filedDate}

EXTRACTED FIGURES (the only numbers you may use, verbatim):
${figures.lines.join("\n")}

FILING EXCERPT (context only — do not use numbers from it):
${mdna}`;

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
      inventedNumberWarnings: checkForInventedNumbers(summary, figures.allowed, snapshot, mdna),
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
