# PROJECT.md — SEC Filings Copilot (MVP)

The complete product and technical spec. `CLAUDE.md` holds the working rules; this file holds the *what* and the *how*. Read both before starting.

---

## 1. The product in one sentence

A web tool where a user types a stock ticker and gets the company's latest SEC filing (10-Q or 10-K) turned into a plain-English summary with the **real financial numbers extracted and displayed** — revenue, YoY growth, margins, EPS, and guidance changes.

That is the entire MVP. Not a portfolio tracker. Not an options analyzer. Not a screener. Not a news feed. One ticker in, one clear filing breakdown out.

## 2. Why the scope is this tight (read before coding)

The biggest risk to this project is scope creep. The hard, defensible part is *reliably extracting correct structured numbers from SEC filings*. Everything else — UI, auth, payments, extra data sources — is comparatively easy and comes later.

So the core data extraction is proven in isolation, with a real correctness test, **before any UI exists.** If a feature isn't in the current phase, it goes in `LATER.md`.

## 3. Tech stack (locked)

- **Framework:** Next.js (App Router) + TypeScript
- **Styling:** Tailwind CSS + shadcn/ui
- **LLM:** Anthropic Claude API via `@anthropic-ai/sdk` — summaries only, never number generation
- **Data:** SEC EDGAR REST APIs (free, no key)
- **Deploy:** Vercel
- **No database, no auth in the MVP.**

## 4. SEC EDGAR — technical reference

EDGAR exposes free JSON APIs at `data.sec.gov`. No key or auth needed, but these rules are hard requirements.

### Mandatory rules
- **`User-Agent` header required on every request.** Format: `"AppName contact@email.com"`. Missing it = blocked. Read from `SEC_USER_AGENT` env var.
- **Max 10 requests/second.** Stay well under. Add a small delay between sequential calls.
- **Values are raw units.** Apple FY2023 revenue = `383285000000`. Format at display time only.

### Endpoints

**Ticker → CIK map** (needed first; EDGAR keys on CIK, not ticker). Fetch once, cache in memory. CIK must be zero-padded to 10 digits for the data endpoints (Apple 320193 → `0000320193`):
```
https://www.sec.gov/files/company_tickers.json
```

**Company Facts** — the primary source. Every XBRL-tagged fact the company has filed, one JSON response. Grouped by taxonomy (`us-gaap`) → concept (`Revenues`, `NetIncomeLoss`, `EarningsPerShareDiluted`, …) → unit (`USD`, `shares`, `USD/shares`). Each fact has `fy`, `fp`, `form`, `accn`, `val`, and period dates:
```
https://data.sec.gov/api/xbrl/companyfacts/CIK{10-digit-cik}.json
```

**Company Concept** — one metric's full history; more efficient when you need a single line item:
```
https://data.sec.gov/api/xbrl/companyconcept/CIK{cik}/us-gaap/{Concept}.json
```

**Submissions** — filing history; use to find the latest 10-Q/10-K and link to the actual document:
```
https://data.sec.gov/submissions/CIK{10-digit-cik}.json
```

### Gotchas to handle explicitly
- **Duplicates:** the same concept recurs across amended filings/periods. De-dupe to the correct, most recent period.
- **Concept naming varies by company:** revenue may be `Revenues`, `RevenueFromContractWithCustomerExcludingAssessedTax`, or `SalesRevenueNet`. Keep an ordered fallback list per metric and try in order.
- **Missing tags:** not every company reports every concept. Show "not reported," never crash.
- **Sign handling:** losses are negative. Verify signs on unprofitable companies.

## 5. Build phases — IN ORDER, WITH STOPS

### PHASE 0 — Setup (then stop)
1. Init Next.js + TypeScript + Tailwind + shadcn/ui.
2. Add `@anthropic-ai/sdk`.
3. `.env.local` with `ANTHROPIC_API_KEY` and `SEC_USER_AGENT` (see `.env.example`).
4. Confirm local build + Vercel deploy (empty landing page is fine).
5. Confirm `LATER.md` exists.
**Stop. Confirm build + deploy before Phase 1.**

### PHASE 1 — Prove extraction in isolation (NO UI)
Build as standalone scripts / inspectable route handlers, not wired to a frontend.
1. **Ticker → CIK resolver.** Test with AAPL.
2. **Latest filing metadata.** From submissions, find most recent 10-Q and 10-K with dates + document link.
3. **Extract core financials** from Company Facts for the most recent period, each with a fallback tag list:
   - Revenue (+ prior-year same period for YoY %)
   - Net income
   - Diluted EPS
   - Operating income
   - Gross margin (if derivable)
   - Total assets / liabilities (optional)
4. **Normalize** into a typed `FilingSnapshot` object: the figures, the period covered, and the source filing link.
5. **EXIT TEST (gates Phase 2):** run full extraction on all five and manually verify against sec.gov:
   - `AAPL` — clean large-cap tech
   - `JPM` — bank, different statement structure
   - `WMT` — retailer
   - `RIVN` — unprofitable growth, negative EPS (check signs)
   - `O` — REIT, reports differently
   **All five must be correct with no manual fixes before Phase 2.**
6. **LLM summary layer.** Pass extracted numbers + the filing's MD&A/key text to the Claude API. Return plain-English prose that uses only the real figures passed in, plus a short "notable changes" section on YoY moves. The model must never introduce a number of its own.
**Stop. Confirm all five work end-to-end before Phase 2.**

### PHASE 2 — Minimal UI (only after Phase 1 passes)
- One page: ticker input, submit button, results view.
- Results: clean headline-numbers card, plain-English summary, "notable changes," link to the source filing.
- Loading + error states (invalid ticker, not found, no recent filing).
- No login, no DB, no payments. Deploy to Vercel.

### LATER (parking lot — do not build)
Earnings call transcripts, red-flag detection, caching/DB, accounts, "rate my portfolio" free hook, paid tiers, alerts, multi-filing comparison.

## 6. Definition of done (MVP)
A deployed Vercel URL where `AAPL`, `JPM`, `WMT`, `RIVN`, `O` each return correct headline financials plus a matching plain-English summary — no manual intervention, no invented numbers.
