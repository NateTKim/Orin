# LAUNCH_READINESS.md — pre-launch audit & fix list

Produced by a full security/reliability/cost audit on 2026-07-06 (branch
`feature/prod-readiness`). This file is the execution plan: each item says
what to do, where, and whether it's a **[CODE]** task (assistant) or a
**[MANUAL]** dashboard task (owner). Work through it top to bottom; items are
already prioritized. No re-investigation should be needed — file paths and
exact changes are given.

**Already done on this branch:** the dashboard empty-state copy fix
(`components/portfolio/portfolio-grid.tsx` — explicit `{" "}` around the bold
"Save" so JSX can't swallow the spaces).

---

## 0. Deploy hygiene — sort this FIRST [CODE, 10 min]

Branch state as of 2026-07-06:

- Local `main` is **2 commits ahead of `origin/main`** (the Pass 1 redesign
  commits `07899f4` + `d69dd4e`) — unpushed.
- **Pass 2** (app screens converted to warm light) is commit `85c6d7f`
  ("Frontend change", committed by the owner) on `feature/redesign-pass2` —
  **not merged into main**.
- `feature/prod-readiness` branches off `85c6d7f` and carries the audit docs
  + copy fix.

Order of operations: merge `feature/redesign-pass2` into `main`, merge
`feature/prod-readiness` into `main` (after fixes below are approved), push,
deploy, and remember the alias re-point (see `MEMORY` / deploy procedure:
`vercel alias set <deployment> orin-filings.vercel.app`). Stale merged
branches listed in PROGRESS.md can be deleted while at it.

---

## 🔴 CRITICAL — before real users

### C1. Rate limiting + concurrent-miss dedupe on the analysis endpoint [CODE]

**Problem.** `GET /api/filing/[ticker]` (`app/api/filing/[ticker]/route.ts`)
is public. An **uncached** lookup costs ~$0.15–0.20 (Claude Sonnet,
~30–40k input tokens from the filing excerpt + ≤4k output) plus up to 60s of
Vercel function time. Anyone can iterate EDGAR's ~10k tickers via
`curl /api/filing/<t>` → low-four-figure dollar burn AND exhaustion of the
Anthropic rate limit (real users would then see "summary unavailable").
Also: two concurrent requests for the same uncached filing each run a full
Claude call (no in-flight lock).

**Agreed approach (lightweight, zero new dependencies):**

1. **Per-IP sliding-window limiter, in-memory, inside the route.**
   - Key: `x-forwarded-for` first hop (fall back to `"unknown"`).
   - Budget: **10 uncached analyses per IP per 5 minutes**. Cache HITs and
     cheap failures (bad ticker, not-found) must NOT consume budget — check
     the limit only at the point the code decides to run the expensive path
     (right after the cache miss, before `buildSnapshot`).
   - On limit: return 429 with an on-brand message, e.g. "You're looking up
     companies faster than we can read filings. Give it a few minutes and
     try again."
   - Implementation: module-level `Map<string, number[]>` of recent
     timestamps, pruned on each check. Cap map size (e.g. 10k IPs) to bound
     memory.
   - **Known tradeoff (accepted):** serverless instances don't share memory,
     so this stops a naive single-source spammer hitting a warm instance,
     not a distributed attack. Good 80/20. Stronger options if ever needed:
     Vercel Firewall rate rule ([MANUAL], dashboard, no code) or Upstash
     Redis (new dependency — needs owner approval per the stack lock).

2. **In-flight dedupe.** Module-level `Map<string, Promise<FilingApiSuccess>>`
   keyed on accession number: on cache miss, if a promise for this accession
   is already in flight, await it instead of starting a second analysis.
   Remove the entry in `finally`.

### C2. Clerk production keys + custom domain [MANUAL — owner, dashboards]

Currently on `pk_test_`/`sk_test_` in production. Consequences of staying:
**hard cap ~100 users**, "Development mode" banner in every auth modal,
shared dev Google OAuth (co-branded consent screen), weaker session security
(URL-based session syncing instead of production cookies).

Steps (Clerk dashboard):
1. App → instance switcher ("Development") → **Create production instance**
   (clones settings).
2. **A custom domain is required** — Clerk production instances cannot run
   on `*.vercel.app` (they set first-party cookies + need DNS records on a
   domain you own). Buy the domain first.
3. Add the DNS records Clerk shows (CNAMEs incl. `clerk.<domain>`), wait for
   SSL checks to pass.
4. Copy `pk_live_…`/`sk_live_…` into Vercel → Project → Settings →
   Environment Variables (Production scope) → redeploy.
5. If offering Google sign-in: create a **production Google OAuth client**
   (dev shared credentials don't carry over) and add it in Clerk.
6. **Dev users do not migrate** to the production instance. Existing test
   accounts and their `saved_stocks` rows (keyed on dev user IDs) become
   orphans — fine now, not fine after launch. Optionally clean the table.

Bonus: the custom domain also fixes the deploy-alias chore — add it in
Vercel → Settings → Domains as the production domain and it auto-updates on
every deploy (no more `vercel alias set`).

### C3. Missing RLS UPDATE policy on `saved_stocks` [MANUAL — owner runs SQL, 2 min]

`saveStock()` in `lib/portfolio/actions.ts` **upserts** on
`(user_id, ticker)`, but `supabase/schema.sql` only defines select/insert/
delete policies. The upsert's conflict path (re-saving an already-saved
ticker, i.e. the intended "refresh after a new filing") requires UPDATE and
will be **refused by RLS**. Fails closed (not exploitable) but it's a booby
trap. Run in Supabase SQL editor:

```sql
-- saved_stocks: allow a user to update THEIR OWN rows (needed by the
-- saveStock upsert's ON CONFLICT DO UPDATE path).
create policy "own saves: update"
  on public.saved_stocks for update to authenticated
  using  ((auth.jwt() ->> 'sub') = user_id)
  with check ((auth.jwt() ->> 'sub') = user_id);
```

Also append this to `supabase/schema.sql` (or a new `supabase/rls_update.sql`)
so the repo matches the live database. [CODE]

---

## 🟡 IMPORTANT — soon, not blocking

### I1. Validate server-action input [CODE]
`lib/portfolio/actions.ts` writes client-supplied strings unvalidated (RLS
confines damage to the user's own rows, but nothing stops a 10MB
`companyName`). Add to `saveStock`: ticker must match
`/^[A-Za-z][A-Za-z.\-]{0,9}$/` (same regex as the API route); length-cap
`companyName` (≤200), `accessionNumber` (≤30), `form` (≤10); `filedDate`
must be `YYYY-MM-DD` or empty. Return `{ ok: false, error: "invalid-input" }`.

### I2. Rename `middleware.ts` → `proxy.ts` [CODE]
Next 16 deprecation warning on every build ("middleware" → "proxy"
convention). Rename file, rename export per Next docs
(https://nextjs.org/docs/messages/middleware-to-proxy). Verify Clerk still
attaches auth (sign-in modal + dashboard still work).

### I3. Friendlier message for foreign filers (20-F/40-F) [CODE]
Companies like Toyota/Shell hit the graceful "no 10-Q or 10-K on file" path
but users won't know why. In `app/api/filing/[ticker]/route.ts`, extend the
`no-recent-filing` message: "This company has no 10-Q or 10-K on file with
the SEC. Foreign companies file different report types (like the 20-F) that
Orin doesn't read yet."

### I4. Dashboard shouldn't show "empty portfolio" on a DB error [CODE]
`getSavedStocks()` returns `[]` on Supabase failure → a user WITH saves sees
the empty state and panics. Distinguish error from empty (e.g. return
`SavedStock[] | null`, and in `app/dashboard/page.tsx` render a soft "We
couldn't load your portfolio just now — refresh in a moment" card on null).

---

## 🟢 NICE-TO-HAVE

- **N1. Client fetch timeout** [CODE]: `runLookup` in
  `components/home-client.tsx` has no AbortController; today the server's
  60s cap ends things (504 HTML → `res.json()` throws → friendly catch), but
  a ~75s client-side abort makes the client self-sufficient.
- **N2. Drop the unused `users` table** [MANUAL SQL + repo doc]: never
  written by app code; FK from `saved_stocks` already dropped.
- **N3. Delete stale merged branches** [CODE]: list in PROGRESS.md.
- **N4. Ticker regex disallows digits** — deliberate, fine for US listings;
  documented here so nobody "fixes" it.

---

## ✅ VERIFIED GOOD (audited 2026-07-06 — don't re-litigate, spot-check at most)

- **Secrets**: all sensitive env reads are server-side (`lib/edgar/client.ts`,
  `lib/summarize.ts`, `lib/supabase/admin.ts` — the latter fenced with
  `import "server-only"`). No `"use client"` anywhere in `lib/`. The only
  `NEXT_PUBLIC_` values are public-by-design (Clerk publishable key,
  Supabase URL + anon key). Anthropic/EDGAR calls: server only.
- **RLS design** (apart from C3): server actions derive the user from the
  Clerk session server-side, never client input; Supabase verifies Clerk
  JWTs (third-party auth provider); `saved_stocks` policies compare
  `auth.jwt()->>'sub'` to `user_id`; cache tables (`cached_filings`,
  `feed_cache`) have RLS enabled with **zero policies** = deny-all for
  clients, service-role only. No bypass found.
- **Error paths, traced end-to-end**: invalid ticker → friendly 400; unknown
  ticker → friendly 404; no recent filing → friendly 404; EDGAR down →
  friendly 502; EDGAR slow → 60s `maxDuration` cap, client's `res.json()`
  throws on the 504 → friendly generic message (no infinite spinner);
  Anthropic failure/timeout/rate-limit → numbers still ship with "summary
  temporarily unavailable" note; **invented-number check** → summary
  withheld with an honest note AND the degraded result is *not cached* so
  the next lookup retries. Loading UI sets expectations ("up to a minute")
  with full skeletons.
- **Caching**: keyed on SEC accession number (auto-invalidates when a new
  filing appears); verified live (`x-orin-cache: HIT`, instant repeats);
  only fully-successful results cached; cache errors degrade to a miss.
- **EDGAR client**: single choke point enforcing `SEC_USER_AGENT` env +
  serialized ~150ms spacing (well under the 10 req/s limit).
