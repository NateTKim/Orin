# Architecture

How Orin works under the hood, and the non-obvious decisions behind it. The visual system is
documented separately in [`DESIGN.md`](DESIGN.md).

## Stack

- **Next.js 16 (App Router) + TypeScript + Tailwind v4 + shadcn/ui** (base-ui under shadcn).
- **Anthropic SDK** (`@anthropic-ai/sdk`): summaries only. Model: **`claude-sonnet-4-6`**
  (`lib/summarize.ts`). The model never generates financial numbers (see the safety check below).
- **SEC EDGAR REST APIs**: all financial data (free, no key; `User-Agent` required).
- **Recharts**: the revenue trend chart.
- **Clerk** (`@clerk/nextjs` v7): auth.
- **Supabase** (`@supabase/supabase-js`): Postgres for the shared caches and per-user data.
- **`server-only`**: guards server-only modules (anything touching the service-role key) out of
  client bundles.
- **Vercel**: hosting.

Scripts under `scripts/` (`extract.ts`, `verify.ts`, `summarize.ts`, `test-downplaying.ts`,
`test-feed.ts`, `health-*.ts`) run standalone via `node --env-file=.env.local scripts/x.ts`
(Node strips the TypeScript). Lib modules that scripts import use **relative** imports, since
plain Node doesn't resolve the `@/` alias; type-only imports are erased, so they're exempt.
Server-only modules that scripts never touch (`lib/portfolio/`) and components use `@/`.

## EDGAR pipeline (`lib/edgar/`)

- **`client.ts`**: the ONE place that calls EDGAR. Reads `SEC_USER_AGENT` from env (fails loud
  if missing; strips BOM/zero-width chars), attaches it to every request, and serializes all
  requests through a promise queue with 150 ms spacing (under EDGAR's 10 req/s). Returns a
  typed `EdgarError`.
- **`cik.ts`**: ticker → zero-padded 10-digit CIK from `company_tickers.json`. The map is
  fetched once and promise-cached in memory, so resolving 40 tickers costs one fetch.
- **`filings.ts`**: `getLatestFilings(cik)` reads the submissions API and returns the latest
  10-Q and 10-K (each a `FilingRef` with `accessionNumber`, `filedDate`, `reportDate`,
  `documentUrl`). `pickLatestFiling` chooses by most recent period.
- **`facts.ts`**: extraction from Company Facts (XBRL):
  - Each metric has an **ordered fallback list of us-gaap tags** (concept names vary by company).
    Revenue tries `Revenues` → `RevenuesNetOfInterestExpense` (banks) →
    `RevenueFromContractWithCustomerExcludingAssessedTax` → … Net income prefers `NetIncomeLoss`,
    then `NetIncomeLossAvailableToCommonStockholdersBasic` (REITs), then `ProfitLoss`.
  - Period/duration matching (a 10-Q flow ≈ one quarter, a 10-K ≈ a year, with windows wide
    enough for 52/53-week fiscal calendars); **de-dupe** repeated facts by most recently
    **filed** (so restatements and amendments win).
  - YoY is computed **only for flow metrics** (revenue/income/EPS). Balance-sheet (instant)
    items get no YoY, because filings compare those to the prior fiscal **year-end**, not the
    year-ago quarter.
  - Gross margin is derived only from reported facts (`GrossProfit`, else revenue − cost of
    revenue) and is "not reported" otherwise (banks, REITs).
  - `extractHistory` builds the revenue/EPS chart series. Companies file no 10-Q for fiscal Q4,
    so a missing Q4 revenue is filled as `annual − the three reported sibling quarters`
    (deterministic arithmetic on real EDGAR figures, flagged `revenueDerived`). EPS is never
    derived this way (per-share values aren't additive).
- **`snapshot.ts`**: split so caching can sit between cheap and expensive work:
  - `resolveLatestFiling(ticker)`: **cheap**. Ticker → CIK + submissions → the latest filing's
    accession number. No facts, no document.
  - `buildSnapshot(cik, filing)`: **expensive**. Company facts + metric/history extraction.
  - `getFilingSnapshot(ticker)`: both together (used by scripts).
- **`document.ts`**: section-aware extraction of the filing's qualitative text (feeds the
  "What most people miss" analysis; the numbers pipeline never touches it):
  - Parses the primary filing HTML by standard item headings and extracts **Risk Factors
    (Item 1A)**, **MD&A (Item 2 in a 10-Q / Item 7 in a 10-K)**, and the **notes**.
    Disambiguates the table of contents from the real section (the candidate with the most
    following content wins). A **phrase-anchored fallback** handles bank 10-Qs (e.g. JPM) whose
    Item 2 is only a cross-reference.
  - **Reading budget** (`TOTAL_BUDGET = 120_000` chars): Risk Factors get first claim (capped at
    50k, keeping the beginning, where material risks lead). MD&A gets the rest, weighted to its
    **end** (liquidity, legal, forward-looking caveats). Notes get leftovers, keeping their
    **end** (commitments, contingencies, legal). Every trim inserts an explicit
    `[... omitted ...]` marker so the model never guesses at what was cut.

## Analysis and summary (`lib/summarize.ts`)

- One `claude-sonnet-4-6` call (`max_tokens: 4000`) per uncached lookup.
- The user message has two blocks: **EXTRACTED FIGURES** (the seven metrics, pre-formatted into
  exact allowed strings) and **FILING TEXT** (the sectioned text from `document.ts`, "context
  only").
- **System prompt hard rules**: use only the EXTRACTED FIGURES, verbatim; never generate,
  estimate, derive, or re-round a number; never state a dollar-amount change or a computed ratio
  (describe changes with the provided YoY % or in words); "not reported" stays not reported;
  never use a number from the filing text; no investment advice. Beginner-friendly voice
  (~8th-grade reading level; jargon explained in parentheses on first use).
- Output is **plain text**: two paragraphs → `Notable changes` + bullets →
  `What management may be downplaying` + 2-3 bullets (steered toward company-specific findings
  such as named lawsuits, concentrations, or covenant pressure, over boilerplate). The UI shows
  that last section as **"What most people miss"** (`parseSummary` in
  `components/home-client.tsx`).
- **Invented-number safety check** (`checkForInventedNumbers`): after the model responds, every
  numeric token in the summary is checked against the allowed figures, the filing excerpt, and
  the snapshot dates. Anything else is flagged, and the API route then **withholds the entire
  summary** (showing a `summaryNote`; the extracted numbers are still displayed).

## Request flow (`app/api/filing/[ticker]/route.ts`)

1. **Validate** the ticker (`/^[A-Za-z][A-Za-z.\-]{0,9}$/`).
2. **Resolve** the latest filing (cheap) to get its accession number.
3. **Cache check** on that accession number. A **HIT** returns the stored payload immediately,
   skipping company facts, the filing-text download, and the Claude call.
4. **Rate-limit gate** (`lib/rate-limit.ts`), reached only on a miss, i.e. only when the request
   is about to cost money: a per-IP sliding window of 10 uncached analyses per 5 minutes,
   answered with `429` + `Retry-After`. A denied call doesn't consume budget. State is
   in-memory per serverless instance, which stops a naive single-source spammer but not a
   distributed attack; a firewall rule or shared store is the upgrade path.
5. **De-duplicated analysis**: concurrent requests for the same uncached filing join one
   in-flight promise (keyed on accession number) instead of each starting a Claude call.
6. `buildSnapshot` + `summarizeFiling`, then **cache the result only if the summary succeeded**,
   so a transient failure is retried on the next lookup instead of being served until the next
   filing.

Responses carry an `x-orin-cache: HIT|MISS` header, and the server logs `[cache HIT/MISS]`,
`[rate-limit]`, and `[dedupe]` lines.

## Caching (`lib/cache.ts`, table `cached_filings`)

- **Keyed on the SEC accession number** (unique per filing). A new filing has a new accession
  number → cache miss → regenerate. No TTL needed; invalidation is automatic and correct.
- The cache is **global/shared** (logged-out users benefit), so it uses the **service-role**
  Supabase client (`lib/supabase/admin.ts`), which bypasses RLS. `cached_filings` has RLS
  enabled with **no policies**, so no client can touch it directly.
- **Fails safe**: any cache read/write error (missing table, Supabase down) degrades to a miss;
  the lookup still works, just uncached.

## Business Health (`lib/health/score.ts`)

A deterministic 1–10 score computed from the extracted metrics. No LLM is involved, so the same
filing always produces the same score.

- Six signals, each normalized to 0..1 through piecewise-linear breakpoint tables: revenue
  growth (0.26), profitability level and trajectory (0.22), margin direction (0.18), operating
  income trajectory (0.12), leverage (0.12), and revenue-trend consistency (0.10).
- Signals that can't be computed are dropped and the remaining weights renormalized. Without
  revenue growth, profitability, and at least three signals overall, the result is
  `{ available: false }` and the UI shows "not enough data".
- **Profitability floor**: a company that is unprofitable *and* deteriorating is capped at 5, so
  it can never read as "Steady".
- The leverage chip is never shown red, because high liabilities/assets is structurally normal
  for banks; the score still accounts for it.
- The "why" sentence is assembled from the computed factors, so it can't invent a number.
- Tuning harnesses: `scripts/health-synthetic.ts` (determinism and floor checks on synthetic
  snapshots) and `scripts/health-check.ts` (real tickers via a running dev server).

## Auth and database wiring (Clerk × Supabase)

- **Clerk is identity, Supabase is data. The bridge is the Clerk user ID** (a string like
  `user_2ab…`), stored on rows as `user_id`.
- `proxy.ts` (Next 16's replacement for `middleware.ts`) is a bare `clerkMiddleware()`. It makes
  auth available but **gates nothing**; the app stays fully usable logged out, and per-user
  access is enforced by server actions + RLS. `ClerkProvider` in `app/layout.tsx` themes Clerk's
  UI to the brand.
- **Sign-in is modal** (`<SignInButton mode="modal">` / `<SignUpButton>`). Client code branches
  on the **`useUser()`** hook.
- **Post-auth redirects** set `forceRedirectUrl` so auth lands directly on the destination
  (`/dashboard` from the nav, `/discover` from a feed card). This is load-bearing: without it,
  Clerk returned to `/`, whose server-side redirect hung during the soft navigation.
- **Save carry-through**: a logged-out "Save" returns the user to `/?ticker=X&save=1`; the Save
  button reads that param reactively and completes the save once after sign-in.
- **Two Supabase clients**:
  - `lib/supabase/server.ts`: per-user, RLS-scoped. Built with
    `accessToken: () => (await auth()).getToken()`, which attaches the Clerk session token.
    Requires the **Clerk ↔ Supabase third-party auth integration** so Supabase trusts Clerk's
    JWT and exposes the Clerk ID as `auth.jwt() ->> 'sub'`.
  - `lib/supabase/admin.ts`: service-role, bypasses RLS, guarded by `import "server-only"`.
    Used for the shared caches (`cached_filings`, `feed_cache`) and dashboard enrichment.
- **Portfolio server actions** (`lib/portfolio/actions.ts`, `"use server"`): `saveStock`,
  `removeStock`, `isStockSaved`, `getSavedStocks`, `checkForNewFilings`. Each derives `userId`
  from `auth()` server-side (never from client input), and inputs are validated at runtime
  (ticker shape, field types and length caps) because server actions are a public RPC surface.
  These are the only write paths to `saved_stocks`.

### Row Level Security (the actual security boundary)

- `users` and `saved_stocks` have RLS policies keyed to `(auth.jwt() ->> 'sub') = user_id`
  (or `= id` for `users`), so a user can only read and write their own rows, enforced by
  Postgres, not app code. There is no FK from `saved_stocks.user_id` to `users.id`, so saving
  doesn't require a `users` row.
- `cached_filings` and `feed_cache` have RLS **enabled with no policies**, so only the
  service-role server can touch them.
- SQL lives in `supabase/`, run in this order: `schema.sql` (users + saved_stocks + policies),
  `saved_stocks.sql` (portfolio columns), `cache.sql` (cached_filings), `feed_cache.sql`
  (feed_cache), `rls_update.sql` (the UPDATE policy that the save upsert needs).

## Dashboard (`app/dashboard/page.tsx`, `lib/portfolio/`)

- Saved companies render as cards with a monogram logo, latest filing info, and a Business
  Health score.
- `enrich.ts` computes each card's health score from the **cached** snapshot of the saved filing
  in one batched Supabase read. No EDGAR or Claude calls; a filing that isn't cached yet shows
  an "open to see health" hint instead.
- `checkForNewFilings` runs from the client after first paint: one lightweight
  `resolveLatestFiling` per company, flagging a "New filing" badge when EDGAR's latest accession
  number differs from the saved one. It never triggers the expensive analysis path.

## Discovery feed (`lib/discover/`, `app/discover/page.tsx`)

- `companies.ts`: 42 curated large-cap tickers across sectors.
- `build.ts`: pure builder. For each ticker, resolve + `getLatestFilings` → the most recently
  **filed** 10-K/10-Q → sort newest first. **Metadata only** (name, ticker, form, date,
  accession), never the expensive analysis. Kept free of Supabase/`server-only` so
  `scripts/test-feed.ts` can run it.
- `feed.ts`: server-only cache wrapper. Reads a single shared row from `feed_cache` (**6h TTL**),
  rebuilds from EDGAR on miss or stale, writes it back. Fails safe to a fresh build.
- `/discover` is **public**. The expensive analysis runs only when a user clicks a card
  (→ `/?ticker=`). Framing is strictly neutral ("New report · filed 3 days ago", no buy/sell
  language).

## Routing

- `app/page.tsx`: **server** component. If signed in and no `?ticker=`, redirect to
  `/dashboard`; otherwise render `components/home-client.tsx` (landing page + results view).
  `/?ticker=X` deep links auto-run the analysis for everyone.
- `app/dashboard/page.tsx`: server; redirects to `/` when logged out; renders the portfolio grid.
- `app/discover/page.tsx`: server, public; renders the feed.
- `app/api/filing/[ticker]/route.ts`: the lookup API (cache + analysis), `maxDuration = 60`.

## Environment variables

Local values live in `.env.local` (gitignored; see [`.env.example`](../.env.example)), production
values in the Vercel project settings. `NEXT_PUBLIC_*` values are browser-safe by design; the
rest are server-only secrets and must never get the `NEXT_PUBLIC_` prefix.

- `ANTHROPIC_API_KEY`: Claude (summaries).
- `SEC_USER_AGENT`: required by EDGAR, format `"AppName email@example.com"`.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`: Clerk.
- `NEXT_PUBLIC_SUPABASE_URL` (base URL, **no** `/rest/v1/`), `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`: Supabase.

**Windows gotcha**: piping a value into `vercel env add` from Windows PowerShell 5.1 prepends a
U+FEFF BOM, which breaks HTTP headers built from it (it once made every EDGAR call fail). Set
Vercel env vars from Git Bash instead: `printf '%s' "$val" | vercel env add NAME production`.
`client.ts` also strips the BOM defensively.
