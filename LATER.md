# LATER.md — Parking Lot

Deferred ideas. Nothing here gets built until it's deliberately pulled into scope. See
`PROGRESS.md` for what's already shipped and `DESIGN.md` for the upcoming redesign.

## Already built (was parked, now done)
- ✅ Caching layer + database (Supabase; cache keyed on accession number)
- ✅ User accounts / auth (Clerk)
- ✅ Historical trend charts (revenue trend chart from real EDGAR history)
- ✅ Saved portfolio + dashboard
- ✅ Discovery feed (curated list)
- ◑ Automated red-flag / risk detection — partially delivered as the "What most people miss"
  section (qualitative caveats from the filing's own Risk Factors / MD&A / notes). A more
  explicit, structured red-flag detector could still be built later.

## Deferred features (do not build yet)

### Discovery / feed
- **Dynamic stock discovery beyond the curated ~40-company list** — e.g. pull the newest 10-K/
  10-Q filers from EDGAR's full-text/recent-filings feeds, or expand the curated set, or let it
  be driven by popularity/sector filters. (Currently a hand-picked list in `lib/discover/companies.ts`.)

### Richer cards (slots already exist in the components)
- ✅ **Richer portfolio cards** — done: `StockCard` now shows a monogram logo, Business Health
  score + label (from cached analysis), latest filing meta, and a "new filing" badge, with a
  grid/list toggle. (The `FeedCard` on `/discover` could get the same treatment later.)
- **Real company logos via logo.dev** — the dashboard/portfolio cards currently use a
  deterministic monogram badge (`components/portfolio/company-logo.tsx`) because there's no
  clean keyless ticker-based logo API. logo.dev offers ticker-based logos on a free tier (needs
  a publishable `NEXT_PUBLIC_` token). Wiring it is a one-file change in `company-logo.tsx`:
  render an `<img src={https://img.logo.dev/ticker/{TICKER}?token=…}>` with an `onError`
  fallback to the existing monogram (so a missing logo never shows a broken image).

### Alerts / notifications
- **Filing alerts / notifications** — tell a user when a company they've saved files a new
  report. The data model already supports detecting this: a saved row stores the filing's
  accession number, so a new accession for that ticker = a new filing. Would need a
  scheduled check + a notification channel (email/in-app).

### Signature motion
- **Signature background animation** — a virtual stock-market / graph line (candles or a moving
  line chart) that subtly follows scroll, as a brand centerpiece. Must stay tasteful, cheap on
  mobile, and respect `prefers-reduced-motion`. Not part of the two-pass redesign unless pulled in.

### Analysis depth
- **Earnings *call* transcript analysis** (filings first).
- **Multi-filing / multi-company comparison** (this quarter vs. last, or company vs. peer).
- **A more explicit red-flag / risk detector** (beyond the current qualitative section).

### Growth / business
- **"Rate my portfolio" free viral hook.**
- **Paid tiers / payments (Stripe).**

## Launch prerequisites (tracked in PROGRESS.md, noted here for completeness)
- Swap Clerk **dev keys → a production Clerk instance** before a real public launch.
- Add a **custom domain** (removes the manual `orin-filings.vercel.app` alias re-point on deploy).
- Optional: a **Clerk webhook to populate the `users` table** (needed only if we start using
  it for email/joins; nothing currently depends on it).

## Ideas that came up mid-build
_(Add anything here as it occurs to you during the build, then keep moving.)_
