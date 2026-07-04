// Section-aware extraction of qualitative text from the primary filing
// document (the same HTML we already download — no new data source). Feeds
// the LLM summary layer only; the numbers pipeline never touches this file.
//
// A filing is sliced by its standard item headings:
//   - Risk Factors        (Item 1A, both forms)
//   - MD&A                (Item 2 in a 10-Q, Item 7 in a 10-K)
//   - Notes to the financial statements (inside Item 1 / Item 8)
// Each section runs from its real heading (not the table-of-contents entry)
// to the next known item heading.
//
// TOKEN BUDGET STRATEGY (why, not just what):
// A full MD&A + risk factors can reach 50-150k characters, so we allocate a
// fixed overall budget and spend it where downplayed information actually
// lives, trimming from the least important parts first:
//   1. RISK FACTORS get first claim, sent in full whenever possible. When
//      over their cap we keep the BEGINNING (risk factors are an itemized
//      list, and companies lead with the ones they consider material).
//   2. MD&A gets the remaining budget. When over its cap we keep a slice of
//      the OPENING (overview context) and spend most of the allowance on the
//      END of the section — liquidity, capital resources, legal matters,
//      segment detail, and forward-looking caveats cluster there, while the
//      middle is mostly line-item variance commentary we can afford to lose.
//   3. NOTES get whatever is left, and only if enough budget remains to be
//      useful. We keep the END of the notes: commitments, contingencies, and
//      legal-proceedings notes conventionally come last, and the earlier
//      notes (accounting policies, instrument tables) are the least likely
//      to hide anything qualitative.
// Every trim inserts an explicit "[... omitted ...]" marker so the model
// knows text is missing and never pretends to have read it.

import { fetchEdgarText } from "./client.ts";

/** Overall character budget across all sections (~30k tokens). */
const TOTAL_BUDGET = 120_000;
/** Risk factors get first claim on the budget, up to this cap. */
const RISK_FACTORS_CAP = 50_000;
/** Fraction of the MD&A allowance spent on its opening (rest goes to the tail). */
const MDNA_HEAD_FRACTION = 0.2;
/** Don't bother including notes unless at least this much budget remains. */
const NOTES_MIN_BUDGET = 8_000;
/** A "section" shorter than this is a TOC entry or cross-reference, not content. */
const MIN_SECTION_CHARS = 2_000;

export interface SectionDiagnostic {
  section: "riskFactors" | "mdna" | "notes";
  found: boolean;
  /** How the section was located: real heading, phrase fallback, or not at all. */
  how: "heading" | "fallback" | "missing";
  fullChars: number;
  sentChars: number;
}

export interface FilingTextResult {
  /** Labeled, budget-trimmed text ready to drop into the prompt. */
  promptText: string;
  diagnostics: SectionDiagnostic[];
}

// ---------------------------------------------------------------------------
// HTML -> text
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

// ---------------------------------------------------------------------------
// Heading detection
// ---------------------------------------------------------------------------

// Item headings with their standardized titles. Matching number + title
// (rather than bare "Item N") avoids the 10-Q ambiguity where Part I and
// Part II reuse the same item numbers.
const P = String.raw`\s*[.:\-–—]*\s*`; // punctuation between number and title
const HEADINGS: Record<string, RegExp> = {
  finStatements: new RegExp(String.raw`item\s*(?:1|8)${P}financial\s+statements`, "gi"),
  mdna: new RegExp(
    String.raw`item\s*(?:2|7)${P}management['’]s\s+discussion\s+and\s+analysis`,
    "gi",
  ),
  quantitative: new RegExp(
    String.raw`item\s*(?:3|7a)${P}quantitative\s+and\s+qualitative\s+disclosures`,
    "gi",
  ),
  controls: new RegExp(String.raw`item\s*(?:4|9a)${P}controls\s+and\s+procedures`, "gi"),
  legal: new RegExp(String.raw`item\s*(?:1|3)${P}legal\s+proceedings`, "gi"),
  riskFactors: new RegExp(String.raw`item\s*1a${P}risk\s+factors`, "gi"),
  unresolvedStaff: new RegExp(String.raw`item\s*1b${P}unresolved\s+staff`, "gi"),
  cybersecurity: new RegExp(String.raw`item\s*1c${P}cybersecurity`, "gi"),
  unregistered: new RegExp(String.raw`item\s*2${P}unregistered\s+sales`, "gi"),
  defaults: new RegExp(String.raw`item\s*3${P}defaults\s+upon`, "gi"),
  mineSafety: new RegExp(String.raw`item\s*4${P}mine\s+safety`, "gi"),
  otherInfo: new RegExp(String.raw`item\s*5${P}other\s+information`, "gi"),
  marketForStock: new RegExp(String.raw`item\s*5${P}market\s+for`, "gi"),
  exhibits: new RegExp(String.raw`item\s*(?:6|15)${P}exhibits`, "gi"),
  notes: new RegExp(
    String.raw`notes\s+to\s+(?:the\s+)?(?:unaudited\s+)?(?:condensed\s+)?(?:interim\s+)?consolidated\s+financial\s+statements`,
    "gi",
  ),
};

/** Words that mark an inline cross-reference rather than a section heading. */
const CROSS_REF_BEFORE =
  /(?:see|in|under|refer(?:red)?\s+to|described\s+in|included\s+in|discussed\s+in|within|and)\s*$/i;

interface HeadingMatch {
  kind: string;
  start: number;
  end: number;
}

function findHeadings(text: string): HeadingMatch[] {
  const matches: HeadingMatch[] = [];
  for (const [kind, re] of Object.entries(HEADINGS)) {
    re.lastIndex = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const before = text.slice(Math.max(0, m.index - 40), m.index);
      if (CROSS_REF_BEFORE.test(before)) continue; // "see Item 1A. Risk Factors"
      matches.push({ kind, start: m.index, end: m.index + m[0].length });
    }
  }
  return matches.sort((a, b) => a.start - b.start);
}

/**
 * Pick the real occurrence of a section heading: of all candidates, the one
 * with the most content before the next known heading. TOC entries lose
 * because the next TOC line follows within a few dozen characters.
 *
 * The "next heading" must be of a DIFFERENT kind: filings repeat the current
 * section's own title as a running page header, and treating those repeats
 * as boundaries would chop the section into page-sized fragments.
 */
function extractSection(
  text: string,
  headings: HeadingMatch[],
  kind: string,
): string | null {
  let best: { content: string; length: number } | null = null;
  for (const h of headings) {
    if (h.kind !== kind) continue;
    const next = headings.find((o) => o.start >= h.end && o.kind !== kind);
    const content = text.slice(h.start, next ? next.start : text.length);
    if (!best || content.length > best.length) {
      best = { content, length: content.length };
    }
  }
  if (!best || best.length < MIN_SECTION_CHARS) return null;
  return best.content;
}

/**
 * Fallback for filings whose formal MD&A item entry is only a cross-reference
 * to MD&A pages elsewhere in the document (notably JPMorgan's 10-Qs, where
 * the MD&A precedes the financial statements). Anchors on occurrences of the
 * phrase itself and ends at the next known heading OR at the start of the
 * financial statements ("Consolidated statements of income/operations..."),
 * picking the occurrence with the most content — TOC entries and running
 * page headers yield tiny slices and lose.
 */
function extractMdnaByPhrase(text: string, headings: HeadingMatch[]): string | null {
  const phrase = /management['’]s\s+discussion\s+and\s+analysis/gi;
  const statements =
    /consolidated\s+(?:and\s+combined\s+)?statements?\s+of\s+(?:income|operations|earnings)|consolidated\s+balance\s+sheets?/gi;

  const boundaries: number[] = headings.map((h) => h.start);
  statements.lastIndex = 0;
  for (let m = statements.exec(text); m; m = statements.exec(text)) {
    boundaries.push(m.index);
  }
  boundaries.sort((a, b) => a - b);

  let best: string | null = null;
  phrase.lastIndex = 0;
  for (let m = phrase.exec(text); m; m = phrase.exec(text)) {
    const from = m.index;
    const to = boundaries.find((b) => b > from + m[0].length) ?? text.length;
    const content = text.slice(from, to);
    if (!best || content.length > best.length) best = content;
  }
  if (!best || best.length < MIN_SECTION_CHARS) return null;
  return best;
}

// ---------------------------------------------------------------------------
// Budgeted assembly
// ---------------------------------------------------------------------------

function trimRiskFactors(text: string, cap: number): { text: string; trimmed: boolean } {
  if (text.length <= cap) return { text, trimmed: false };
  // Keep the beginning: risk factors are an ordered list, material ones first.
  return {
    text:
      text.slice(0, cap) +
      "\n[... remaining risk factors omitted to fit the reading budget ...]",
    trimmed: true,
  };
}

function trimMdna(text: string, cap: number): { text: string; trimmed: boolean } {
  if (text.length <= cap) return { text, trimmed: false };
  // Keep a slice of the opening for context, then spend the rest of the
  // allowance on the END of the MD&A (liquidity, legal, forward-looking
  // caveats). The middle — line-item variance commentary — is dropped.
  const headLen = Math.floor(cap * MDNA_HEAD_FRACTION);
  const tailLen = cap - headLen;
  return {
    text:
      text.slice(0, headLen) +
      "\n[... middle of the MD&A omitted to fit the reading budget; the opening overview and the later sections (liquidity, legal matters, outlook and caveats) are kept in full ...]\n" +
      text.slice(-tailLen),
    trimmed: true,
  };
}

function trimNotes(text: string, cap: number): { text: string; trimmed: boolean } {
  if (text.length <= cap) return { text, trimmed: false };
  // Keep the END: commitments, contingencies and legal notes come last by
  // convention; early notes (accounting policies) rarely hide anything.
  return {
    text:
      "[... earlier notes omitted to fit the reading budget; the final notes (commitments, contingencies, legal proceedings) are kept ...]\n" +
      text.slice(-cap),
    trimmed: true,
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Fetch the primary filing document and return the qualitative sections the
 * summary layer reads, budgeted per the strategy at the top of this file.
 * Always returns SOMETHING usable — per-section fallbacks degrade to the old
 * phrase-anchored window rather than failing.
 */
export async function getFilingText(filingUrl: string): Promise<FilingTextResult> {
  const html = await fetchEdgarText(filingUrl);
  const text = htmlToText(html);
  const headings = findHeadings(text);
  const diagnostics: SectionDiagnostic[] = [];

  // --- locate sections ---
  const riskFactorsFull = extractSection(text, headings, "riskFactors");

  let mdnaFull = extractSection(text, headings, "mdna");
  let mdnaHow: SectionDiagnostic["how"] = mdnaFull ? "heading" : "missing";
  if (!mdnaFull) {
    mdnaFull = extractMdnaByPhrase(text, headings);
    if (mdnaFull) mdnaHow = "fallback";
  }

  const notesFull = extractSection(text, headings, "notes");

  // --- spend the budget ---
  let remaining = TOTAL_BUDGET;
  const parts: string[] = [];

  if (riskFactorsFull) {
    const cap = Math.min(RISK_FACTORS_CAP, remaining);
    const { text: t, trimmed } = trimRiskFactors(riskFactorsFull, cap);
    parts.push(`=== RISK FACTORS (Item 1A)${trimmed ? " — partial" : ""} ===\n${t}`);
    remaining -= t.length;
    diagnostics.push({
      section: "riskFactors",
      found: true,
      how: "heading",
      fullChars: riskFactorsFull.length,
      sentChars: t.length,
    });
  } else {
    diagnostics.push({ section: "riskFactors", found: false, how: "missing", fullChars: 0, sentChars: 0 });
  }

  if (mdnaFull) {
    // Leave room for notes only when the MD&A wouldn't fit anyway.
    const cap = Math.max(remaining - NOTES_MIN_BUDGET, Math.min(mdnaFull.length, remaining));
    const { text: t, trimmed } = trimMdna(mdnaFull, Math.min(cap, remaining));
    parts.push(
      `=== MANAGEMENT'S DISCUSSION AND ANALYSIS${trimmed ? " — middle omitted" : ""} ===\n${t}`,
    );
    remaining -= t.length;
    diagnostics.push({
      section: "mdna",
      found: true,
      how: mdnaHow,
      fullChars: mdnaFull.length,
      sentChars: t.length,
    });
  } else {
    diagnostics.push({ section: "mdna", found: false, how: "missing", fullChars: 0, sentChars: 0 });
  }

  if (notesFull && remaining >= NOTES_MIN_BUDGET) {
    const { text: t, trimmed } = trimNotes(notesFull, remaining);
    parts.push(
      `=== NOTES TO THE FINANCIAL STATEMENTS${trimmed ? " — final notes only" : ""} ===\n${t}`,
    );
    remaining -= t.length;
    diagnostics.push({
      section: "notes",
      found: true,
      how: "heading",
      fullChars: notesFull.length,
      sentChars: t.length,
    });
  } else {
    diagnostics.push({
      section: "notes",
      found: Boolean(notesFull),
      how: notesFull ? "heading" : "missing",
      fullChars: notesFull?.length ?? 0,
      sentChars: 0,
    });
  }

  // Failsafe: if nothing parsed at all, fall back to the head of the document
  // so the summary layer still has real filing text to work with.
  if (parts.length === 0) {
    parts.push(`=== FILING TEXT (start of document) ===\n${text.slice(0, TOTAL_BUDGET / 2)}`);
  }

  return { promptText: parts.join("\n\n"), diagnostics };
}
