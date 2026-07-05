-- Orin — shared filing-analysis cache. Run once in the Supabase SQL editor
-- (SQL Editor → New query → paste → Run).
--
-- Keyed on the filing's SEC accession number, which is unique per filing. When
-- a company publishes a new report the accession number changes, so the next
-- lookup misses the cache and regenerates — automatic, correct invalidation
-- with no time-based expiry to tune.
--
-- This table is GLOBAL: every visitor benefits, signed in or not. It is only
-- ever read/written by the server using the service-role key, so RLS is
-- enabled with NO policies — that denies all direct client access while the
-- server (which bypasses RLS) manages it.

create table if not exists public.cached_filings (
  accession_number text primary key,   -- unique SEC ID for this specific filing
  ticker           text not null,
  form             text not null,       -- 10-Q or 10-K
  period_end       date,
  result           jsonb not null,      -- full API result: numbers + summary + insights
  cached_at        timestamptz not null default now()
);

create index if not exists cached_filings_ticker_idx
  on public.cached_filings (ticker);

alter table public.cached_filings enable row level security;
-- Intentionally no policies: only the server's service-role key touches this.
