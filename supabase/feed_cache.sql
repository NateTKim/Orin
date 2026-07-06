-- Orin — shared cache for the discovery feed. Run once in the Supabase SQL
-- editor (SQL Editor → New query → paste → Run). Idempotent.
--
-- The feed is built by fetching lightweight filing metadata for a curated list
-- of ~40 companies from EDGAR (~6-7s). We store the built feed here and only
-- rebuild every few hours, so normal page loads are instant. Global/shared:
-- every visitor (signed in or not) gets the same feed. Server service-role
-- only, so RLS is enabled with no policies (no direct client access).

create table if not exists public.feed_cache (
  id           text primary key,        -- cache key, e.g. 'discover'
  data         jsonb not null,          -- the built feed (array of items)
  refreshed_at timestamptz not null default now()
);

alter table public.feed_cache enable row level security;
-- Intentionally no policies: only the server's service-role key touches this.
