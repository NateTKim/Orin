# PROGRESS.md — where Orin stands

Living status doc. Read this + `ARCHITECTURE.md` + `DESIGN.md` after `CLAUDE.md`/`PROJECT.md`
to pick up the project. Last updated: 2026-07-06.

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

## What's verified vs. not

- Verified by me: builds/typechecks, EDGAR extraction correctness (5-ticker exit test +
  spot-checks against sec.gov), cache HIT/MISS behavior, invented-number check clean on the
  test tickers, logged-out routing, the discovery feed contents, production smoke tests.
- Verified by the owner locally: sign-in → dashboard, save/remove.
- **Not yet fully tested**: a full logged-in end-to-end sweep incl. save-from-a-feed-card. The
  owner plans a "super test" once all features are in. Treat the logged-in save paths as
  "should work, lightly tested."

## Next planned step — launch-readiness fixes

A full security/reliability/cost audit was done on 2026-07-06. **The execution plan lives in
`LAUNCH_READINESS.md`** — prioritized Critical / Important / Nice-to-have items, each marked
[CODE] (assistant) or [MANUAL] (owner dashboard task), with the exact SQL and the agreed
rate-limiting approach included. Work top to bottom; the Verified-good section lists what was
already audited clean so it doesn't get re-investigated.

**Deploy hygiene to sort FIRST (branch state as of 2026-07-06):** local `main` is 2 commits
ahead of `origin/main` (unpushed Pass 1); Pass 2 is commit `85c6d7f` ("Frontend change") on
`feature/redesign-pass2`, **unmerged**; the audit docs + dashboard copy fix are on
`feature/prod-readiness` (branched off `85c6d7f`). Merge pass2 → main, then prod-readiness
work → main, push, deploy, re-point the alias.

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
- **Stale local branches**: `feature/accounts-db`, `feature/filing-cache`, `feature/landing-page`,
  `feature/saved-portfolio`, `feature/discover-feed` are all merged into `main` and can be
  deleted. (`feature/saved-portfolio` was squash-merged, so git shows it "unmerged"; use `-D`.)
- **Cost**: an uncached lookup sends ~30k input tokens (full filing sections) to Sonnet
  (~$0.09). Cache hits cost nothing. Fine at current scale.
- Four SQL files in `supabase/` must be run once in the Supabase SQL editor (all already run in
  the shared project): `schema.sql`, `saved_stocks.sql`, `cache.sql`, `feed_cache.sql`.
