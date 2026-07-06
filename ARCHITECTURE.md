# ARCHITECTURE.md — how Orin works under the hood

The non-obvious technical decisions a fresh session needs. Pairs with `PROGRESS.md` (status)
and `DESIGN.md` (upcoming visual direction).

## Stack (as actually built)

- **Next.js 16 (App Router) + TypeScript + Tailwind v4 + shadcn/ui** (base-ui under shadcn).
- **Anthropic SDK** (`@anthropic-ai/sdk`) — summaries only. Model: **`claude-sonnet-4-6`**
  (`lib/summarize.ts`). The model never generates financial numbers (see safety check).
- **SEC EDGAR REST APIs** — all financial data (free, no key; `User-Agent` required).
- **Recharts** — the revenue trend chart.
- **Clerk** (`@clerk/nextjs` v7, `@clerk/themes`) — auth.
- **Supabase** (`@supabase/supabase-js`) — Postgres (cache + user data).
- **`server-only`** — guards server-only modules (service-role key) from client bundles.
- **Vercel** — hosting.

Scripts under `scripts/` (e.g. `extract.ts`, `verify.ts`, `test-downplaying.ts`, `test-feed.ts`)
run standalone via `node --env-file=.env.local scripts/x.ts` (Node strips TS). They import lib
modules by **relative** path; `lib/` modules therefore use relative imports internally (not the
`@/` alias) so scripts keep working. Components use the `@/` alias (Next resolves it).

## EDGAR pipeline (`lib/edgar/`)

- **`client.ts`** — the ONE place that calls EDGAR. Reads `SEC_USER_AGENT` from env (fails loud
  if missing; strips BOM/zero-width chars), attaches it to every request, and serializes all
  requests through a promise queue with ~150ms spacing (stays under EDGAR's 10 req/s). Returns
  typed `EdgarError`.
- **`cik.ts`** — ticker → zero-padded 10-digit CIK from `company_tickers.json`. The map is
  fetched once and cached in memory (promise-cached), so resolving 40 tickers = 1 fetch.
- **`filings.ts`** — `getLatestFilings(cik)` reads the submissions API and returns the latest
  10-Q and 10-K (each a `FilingRef` with `accessionNumber`, `filedDate`, `reportDate`,
  `documentUrl`). `pickLatestFiling` chooses by most recent period.
- **`facts.ts`** — extraction from Company Facts (XBRL):
  - Each metric has an **ordered fallback list of us-gaap tags** (concept names vary by company).
    Revenue tries `Revenues` → `RevenuesNetOfInterestExpense` (banks) →
    `RevenueFromContractWithCustomerExcludingAssessedTax` → … Net income prefers `NetIncomeLoss`,
    then `NetIncomeLossAvailableToCommonStockholdersBasic`, then `ProfitLoss` (REITs).
  - Period/duration matching (a 10-Q flow ≈ one quarter, a 10-K ≈ a year); **de-dupe** repeated
    facts by most-recently-**filed** (reflects restatements).
  - YoY is computed **only for flow metrics** (revenue/income/EPS). Balance-sheet (instant)
    items get no YoY, because filings compare those to the prior fiscal **year-end**, not the
    year-ago quarter — a year-ago comparison wouldn't match the filing.
  - `extractHistory` builds the revenue/EPS chart series. Companies file no 10-Q for fiscal Q4,
    so a missing Q4 revenue is filled as `annual − the three reported sibling quarters`
    (deterministic arithmetic on real EDGAR figures, flagged `revenueDerived`). EPS is never
    derived this way (per-share values aren't additive).
- **`snapshot.ts`** — split so caching can happen between cheap and expensive work:
  - `resolveLatestFiling(ticker)` — **cheap**: ticker→CIK + submissions → the latest filing's
    accession number. No facts, no document.
  - `buildSnapshot(cik, filing)` — **expensive**: company facts + metric/history extraction.
  - `getFilingSnapshot(ticker)` — both together (used by scripts).
  - `FilingSnapshot` carries `accessionNumber` (added for saving + cache-key display).
- **`document.ts`** — section-aware extraction of the filing's qualitative text (feeds the
  "what most people miss" analysis; the numbers pipeline never touches this):
  - Parses the primary filing HTML by standard item headings; extracts **full Risk Factors
    (Item 1A)**, **MD&A (Item 2 in 10-Q / Item 7 in 10-K)**, and the **notes**. Disambiguates the
    table-of-contents vs. the real section (the candidate with the most following content wins;
    running page-headers don't split sections). A **phrase-anchored fallback** handles bank 10-Qs
    (e.g. JPM) whose Item 2 is only a cross-reference.
  - **Token budget** (`TOTAL_BUDGET = 120_000` chars): Risk Factors get first claim (cap 50k,
    keep the beginning — material risks lead). MD&A gets the rest, weighted to its **END**
    (liquidity, legal, forward-looking caveats live there; the middle line-item commentary is
    dropped). Notes get leftovers, keeping their **END** (commitments/contingencies/legal come
    last). Every trim inserts an explicit `[... omitted ...]` marker so the model never invents
    what was cut.

## Analysis / summary (`lib/summarize.ts`)

- One `claude-sonnet-4-6` call (`max_tokens: 4000`) per uncached lookup.
- The user message has two blocks: **EXTRACTED FIGURES** (the seven metrics, pre-formatted into
  exact allowed strings) and **FILING TEXT** (the sectioned text from `document.ts`, "context
  only").
- **System prompt hard rules**: only use the EXTRACTED FIGURES verbatim; never generate,
  estimate, derive, or re-round a number; never state a dollar-amount change or a computed ratio
  (describe changes with the provided YoY % or in words); "not reported" stays not reported;
  never use a number from the filing text; no investment advice. Beginner-friendly voice
  (~8th-grade; jargon explained in parentheses on first use).
- Output is **plain text** (no markdown): two paragraphs → a line `Notable changes` + bullets →
  a line `What management may be downplaying` + 2-3 bullets (steered toward company-SPECIFIC
  findings — named lawsuits, concentrations, covenant pressure — over boilerplate). The UI
  renames this last section **"What most people miss"** (`components/home-client.tsx` `parseSummary`).
- **Invented-number safety check** (`checkForInventedNumbers`): after the model responds, every
  numeric token in the summary is checked against the allowed figures + the filing excerpt +
  the snapshot dates. Anything else is flagged. The API route then **withholds the entire
  summary** if any token is flagged (shows a `summaryNote`; the extracted numbers are still
  displayed). Only clean, non-null summaries are cached.

## Caching (`lib/cache.ts`, table `cached_filings`)

- **Keyed on the SEC accession number** (unique per filing). A new filing has a new accession
  number → cache miss → regenerate. No TTL, no staleness logic needed — invalidation is
  automatic and correct.
- Request flow (`app/api/filing/[ticker]/route.ts`): validate ticker → `resolveLatestFiling`
  (cheap) → `getCachedFiling(accession)`. **HIT** returns the stored payload instantly (skips
  company facts, the filing-text download, AND the Claude call). **MISS** → `buildSnapshot` +
  `summarizeFiling` → cache the result **only if the summary succeeded** → return.
- Response carries an `x-orin-cache: HIT|MISS` header; the server logs `[cache HIT/MISS] …`.
- The cache is **global/shared** (logged-out users benefit), so it uses the **service-role**
  Supabase client (`lib/supabase/admin.ts`), which bypasses RLS. `cached_filings` has RLS
  enabled with **no policies** → no client can touch it directly; only the server can.
- **Fails safe**: any cache read/write error (missing table, Supabase down) degrades to a miss;
  the lookup still works, just uncached.
- On a cache HIT the route sets `cached.snapshot.accessionNumber = filing.accessionNumber`
  (entries cached before that field existed).

## Auth + database wiring (Clerk × Supabase)

- **Clerk is identity, Supabase is data. The bridge is the Clerk user ID** (a string like
  `user_2ab…`), stored on rows as `user_id`.
- `middleware.ts` = bare `clerkMiddleware()` — makes auth available but **gates nothing** (the
  app stays usable logged-out). `ClerkProvider` wraps the app in `app/layout.tsx` (dark theme +
  indigo, to be revisited in the redesign).
- **Sign-in is modal** (`<SignInButton mode="modal">` / `<SignUpButton>`). Clerk v7 removed the
  `<SignedIn>/<SignedOut>` control components in favor of a server-only `<Show>`, so client code
  branches on the **`useUser()`** hook (`components/auth-controls.tsx`).
- **Post-auth redirect**: buttons set `forceRedirectUrl` so auth lands directly on the
  destination (`/dashboard` for nav sign-in; back to `/?ticker=<stock>` for the "Sign in to
  save" button). This is load-bearing — without it, Clerk returned to `/`, whose server-side
  redirect to `/dashboard` hung during the soft navigation ("Rendering" black screen). Don't
  remove it.
- **Two Supabase clients**:
  - `lib/supabase/server.ts` — per-user, RLS-scoped. Built with
    `accessToken: () => (await auth()).getToken()`, which attaches the Clerk session token.
    Requires the **Clerk↔Supabase third-party auth integration** (configured in both dashboards)
    so Supabase trusts Clerk's JWT and exposes the Clerk ID as `auth.jwt() ->> 'sub'`.
  - `lib/supabase/admin.ts` — service-role, bypasses RLS. Server-only (guarded by
    `import "server-only"`). Used for the shared caches (`cached_filings`, `feed_cache`).
- **Portfolio server actions** (`lib/portfolio/actions.ts`, `"use server"`): `saveStock`,
  `removeStock`, `isStockSaved`, `getSavedStocks`. Each derives `userId` from `auth()`
  server-side (never trusts the client). These are the only write paths to `saved_stocks`.

### Row Level Security (the actual security boundary)

- `users` and `saved_stocks` have RLS policies keyed to `(auth.jwt() ->> 'sub') = user_id`
  (or `= id` for `users`), so a user can only read/write their own rows — enforced by Postgres,
  not app code. The FK from `saved_stocks.user_id` to `users.id` was **dropped** so saving
  doesn't require a `users` row.
- `cached_filings` and `feed_cache` have RLS **enabled with no policies** → only the
  service-role server can touch them (shared caches, not per-user).
- SQL lives in `supabase/`: `schema.sql` (users + saved_stocks + policies), `saved_stocks.sql`
  (adds columns, drops FK), `cache.sql` (cached_filings), `feed_cache.sql` (feed_cache). All
  already run in the shared Supabase project.

## Discovery feed (`lib/discover/`, `app/discover/page.tsx`)

- `companies.ts` — ~40 curated large-cap tickers (spread across sectors), in code for now.
- `build.ts` — pure builder: for each ticker, resolve + `getLatestFilings` → the most
  recently **filed** 10-K/10-Q → sort newest first. **Metadata only** (name, ticker, form,
  date, accession) — never the expensive analysis. Kept free of Supabase/`server-only` so
  `scripts/test-feed.ts` can run it.
- `feed.ts` — server-only cache wrapper: reads a single shared row from `feed_cache`
  (**6h TTL**), rebuilds from EDGAR on miss/stale, writes it back. Fails safe to a fresh build.
- `/discover` is **public** (logged-in and logged-out). The expensive analysis still only runs
  when a user clicks a card (→ `/?ticker=`). Framing is strictly neutral (no buy/sell language).

## Routing / page structure

- `app/page.tsx` — **server** component: `auth()`; if signed-in and no `?ticker=`, redirect to
  `/dashboard`; else render `components/home-client.tsx` (the big client component: landing +
  results/tool, incl. the bento results layout and the Save button). `/?ticker=X` deep links
  auto-run the analysis for everyone.
- `app/dashboard/page.tsx` — server, redirects to `/` if logged out; renders the portfolio grid.
- `app/discover/page.tsx` — server, public, renders the feed.
- `app/api/filing/[ticker]/route.ts` — the lookup API (cache + analysis), `maxDuration = 60`.

## Environment variables

Local in `.env.local` (gitignored), production in Vercel. `NEXT_PUBLIC_*` are browser-safe by
design; the others are server-only secrets and must NEVER get the `NEXT_PUBLIC_` prefix.

- `ANTHROPIC_API_KEY` — Claude (summaries).
- `SEC_USER_AGENT` — required by EDGAR, format `"AppName email@example.com"`.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` — Clerk.
- `NEXT_PUBLIC_SUPABASE_URL` (base URL, **no** `/rest/v1/`), `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` — Supabase.

**Windows gotcha**: piping a value into `vercel env add` from PowerShell prepends a U+FEFF BOM
that breaks HTTP headers built from it (caused every EDGAR call to 502 once). Set Vercel env
vars via Git Bash: `printf '%s' "$val" | vercel env add NAME production`. `client.ts` also strips
BOM defensively.

## Deployment

- Vercel project `natek/orin-filings`. Deploy flow (see the owner's standing preference):
  **commit → merge to `main` → `git push origin main` → `vercel --prod --yes` → then
  `vercel alias set <new-deployment>.vercel.app orin-filings.vercel.app`** (the clean URL is a
  manual alias and does NOT auto-update; `earnings-ai-v2.vercel.app` does). Verify both URLs
  before calling done.
- Deployment protection (Vercel Authentication) is disabled so all `.vercel.app` URLs are public.
