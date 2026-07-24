# PROGRESS.md — where Orin stands

Living status doc. Read this + `ARCHITECTURE.md` + `DESIGN.md` after `CLAUDE.md`/`PROJECT.md`
to pick up the project. Last updated: 2026-07-08.

> Note: `CLAUDE.md`/`PROJECT.md` describe the *original* MVP (no DB, no auth, dark stack
> "locked"). The project has since deliberately grown past that under the owner's direction —
> accounts, a database, caching, a portfolio, and a discovery feed are all built and shipped.
> Where this file and the original spec disagree, this file is current.

## Shipped and live in production

Live at **https://orin-filings.vercel.app** (see `ARCHITECTURE.md` → Deployment). All of the
below is on `main` and deployed:

- **Core analysis tool** — type a ticker, get the latest 10-K/10-Q as:
  - Real financial numbers extracted from SEC EDGAR XBRL (revenue + YoY, net income, diluted
    EPS, operating income, gross margin, total assets/liabilities), each "not reported" when
    absent — never invented.
  - A real revenue trend chart (Recharts) from multi-period EDGAR history.
  - A plain-English, beginner-friendly summary + "Notable changes".
  - The signature **"What most people miss"** section — qualitative caveats drawn from the
    filing's own Risk Factors / MD&A / notes (this is the model's "What management may be
    downplaying" output, renamed in the UI).
- **Caching** — generated results cached in Supabase keyed on the filing's accession number;
  repeat lookups of the same filing are ~instant and skip the expensive AI call.
- **Accounts** — Clerk auth (sign up / in / out, Google), themed modal, additive (logged-out
  users can still do everything except save).
- **Saved portfolio** — logged-in users save companies; `/dashboard` shows them as cards;
  remove on hover; card → full analysis. Row Level Security scopes saves per user.
- **Discovery feed** — public `/discover`: ~40 curated large caps by most recent filing,
  newest first, neutral framing; cards click into analysis; save from a card. Cached 6h.
- **Landing page** — the warm "sunrise" marketing moment: illustrated dawn scene (sky
  gradient, stars, rising sun, mountain horizon, mist — all CSS/SVG), serif display
  headline, floating search pill.
- **Warm redesign, BOTH passes done** — Pass 1 (design tokens + landing) and Pass 2 (results,
  dashboard, discover converted to the calm warm-light workspace; legacy dark theme fully
  removed). Tokens and rules documented in `DESIGN.md`. **The app is feature-complete and
  visually redesigned.**
- **Business Health signal** (results screen) — a glanceable, deterministic 1–10 score with a
  Strengthening/Steady/Mixed/Weakening label, computed purely from extracted metrics (no LLM,
  same filing → same score). Six weighted signals (revenue growth, revenue-trend consistency,
  margin direction, profitability, operating income, leverage) in `lib/health/score.ts`;
  transparent factor chips, a deterministic plain-English "why", a "not enough data" state, a
  profitability floor (unprofitable + worsening can't read "Steady"), a never-red debt chip,
  and explicit not-investment-advice framing. Tuning harnesses in `scripts/health-*.ts`.
- **Landing hero motion** — the one animated moment: staged fade-up on load, a rising +
  breathing sun, twinkling stars, drifting clouds, and gentle pointer/scroll parallax across
  five depth layers, plus scene enrichment (six ranges, haze, film grain). All
  transform/opacity, `prefers-reduced-motion` honored, mobile simplified.
- **Conversion improvements** — logged-out "Save" opens a warm benefit-framed popover
  (reciprocity/endowment) whose sign-up/in **carries the intended save through** via a
  one-shot `?save=1` (read reactively so the fast sign-in path doesn't lose the race); landing
  page has one-tap ticker suggestion chips.
- **Launch-readiness code fixes (shipped)** — per-IP rate limiting + concurrent-miss dedupe on
  the analysis endpoint (`lib/rate-limit.ts`); server-action input validation; `middleware.ts`
  migrated to `proxy.ts` (Next 16); foreign/ADR filer message (20-F/40-F); dashboard load-error
  state distinct from empty. Full audit + remaining items in `LAUNCH_READINESS.md`.

## What's verified vs. not

- Verified by me: builds/typechecks, EDGAR extraction correctness (5-ticker exit test +
  spot-checks against sec.gov), cache HIT/MISS behavior, invented-number check clean on the
  test tickers, logged-out routing, the discovery feed contents, production smoke tests.
- Verified by the owner locally: sign-in → dashboard, save/remove.
- **Not yet fully tested**: a full logged-in end-to-end sweep incl. save-from-a-feed-card. The
  owner plans a "super test" once all features are in. Treat the logged-in save paths as
  "should work, lightly tested."
- **Save carry-through** (`?save=1` auto-save after auth): the signed-in path can't be tested
  headlessly (Clerk bot protection), so it's verified by construction only — worth one live
  confirm (log out → Save → sign in → lands back Saved).

## Next planned step

No single mandate in flight. All recent feature work (Business Health, hero motion, conversion
improvements) and the launch-readiness **code** fixes are shipped, merged to `main`, and
deployed. `main` is in sync with `origin/main`.

**Remaining before a real public launch — mostly MANUAL (owner):**
- **C2 — Clerk production keys + custom domain** (owner, dashboards). Still on DEV keys. See
  `LAUNCH_READINESS.md` for the step-by-step; a custom domain also retires the alias chore.
- ~~**C3 — RLS UPDATE policy on `saved_stocks`.**~~ ✅ **Done** (owner ran `supabase/rls_update.sql`
  in the Supabase SQL editor, 2026-07-08) — the save-refresh upsert path is now unblocked.
- **N-items** (nice-to-have, `LAUNCH_READINESS.md`): client fetch timeout, drop unused `users`
  table, delete stale merged branches.

`LAUNCH_READINESS.md` remains the source of truth for pre-launch work, including a
Verified-good section listing what was already audited clean.

## Known issues / loose ends / TODOs

> The launch-blocking subset of these now lives, with fix details, in `LAUNCH_READINESS.md` —
> that file is the source of truth for pre-launch work.

- **Clerk is on DEV keys in production** (`pk_test_`/`sk_test_`). Works, but shows a Clerk dev
  banner and uses shared Google OAuth. Before a real launch: create a Clerk **production
  instance** (own domain, `pk_live_`/`sk_live_`, own Google credentials) and swap the Vercel
  env vars.
- **`orin-filings.vercel.app` is a manual alias** — it does NOT auto-update on deploy. Every
  `vercel --prod` must be followed by `vercel alias set <new-deployment> orin-filings.vercel.app`.
  The canonical `earnings-ai-v2.vercel.app` auto-updates. A real custom domain would remove this
  chore (owner plans to add one "pretty soon").
- **`users` table is not populated** — Clerk is the source of truth; we dropped the FK from
  `saved_stocks` to `users`, so nothing needs it yet. A Clerk webhook to sync users into the
  table is a clean future add (needed if we ever want email/joins).
- **MD&A fallback is shallow for bank-style filers** (e.g. JPM): the phrase-anchored fallback
  captures ~25k of ~200k chars (the opening). JPM still gets full Risk Factors + notes, so the
  "what most people miss" output is still good — but tightening this is a known improvement.
- **Big filers restate huge Risk Factors** (RIVN ~227k chars); we send the first 50k. Fine, but
  noted.
- **Stale local branches**: many merged feature branches remain locally (the early ones —
  `feature/accounts-db`, `feature/filing-cache`, `feature/landing-page`, `feature/saved-portfolio`,
  `feature/discover-feed` — plus the recent stack: `feature/redesign-pass1`, `feature/redesign-pass2`,
  `feature/prod-readiness`, `feature/rate-limiting`, `feature/important-fixes`,
  `feature/conversion-improvements`, `feature/hero-motion`, `feature/business-health`). All are
  merged into `main` and can be deleted (use `-D`; some were fast-forward/squash merges).
- **Cost / abuse**: an uncached lookup sends ~30k input tokens (full filing sections) to Sonnet
  (~$0.09); cache hits cost nothing. The analysis endpoint now has per-IP rate limiting +
  concurrent-miss dedupe (`lib/rate-limit.ts`) — in-memory, so per-serverless-instance (stops
  the naive single-source spammer, not a distributed attack).
- SQL files in `supabase/` to run once in the Supabase SQL editor: `schema.sql`,
  `saved_stocks.sql`, `cache.sql`, `feed_cache.sql`, and `rls_update.sql` — **all run** in the
  shared project.
