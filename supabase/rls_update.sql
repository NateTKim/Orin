-- Orin — add the missing RLS UPDATE policy on saved_stocks. Run once in the
-- Supabase SQL editor (SQL Editor → New query → paste → Run). Safe to re-run.
--
-- WHY: saveStock() in lib/portfolio/actions.ts upserts on (user_id, ticker).
-- When a user re-saves a ticker they already have (e.g. refreshing after a new
-- filing), the upsert takes its ON CONFLICT DO UPDATE path, which needs UPDATE
-- permission. schema.sql only granted select/insert/delete, so that path was
-- refused by RLS. This closes the gap — a user may update only their OWN rows.

drop policy if exists "own saves: update" on public.saved_stocks;

create policy "own saves: update"
  on public.saved_stocks for update to authenticated
  using  ((auth.jwt() ->> 'sub') = user_id)
  with check ((auth.jwt() ->> 'sub') = user_id);
