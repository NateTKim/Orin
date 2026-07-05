-- Orin — extend saved_stocks for the portfolio feature. Run once in the
-- Supabase SQL editor (SQL Editor → New query → paste → Run). Idempotent.
--
-- Adds the fields the dashboard shows without re-fetching (and that let us
-- detect a NEW filing later): company name, the filing's accession number,
-- filing type, and filing date. RLS from schema.sql already restricts every
-- row to its owner (auth.jwt() ->> 'sub' = user_id) — unchanged here.

alter table public.saved_stocks
  add column if not exists company_name     text,
  add column if not exists accession_number text,
  add column if not exists form             text,
  add column if not exists filed_date       date;

-- user_id holds the Clerk user ID directly (Clerk is the source of truth for
-- identity). Drop the foreign key to the users mirror so a save never depends
-- on a users row existing; ownership is still enforced by RLS.
alter table public.saved_stocks
  drop constraint if exists saved_stocks_user_id_fkey;
