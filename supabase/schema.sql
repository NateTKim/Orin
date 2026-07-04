-- Orin — initial database schema.
-- Run this once in the Supabase dashboard: SQL Editor → New query → paste → Run.
--
-- Auth model: Clerk is the identity provider. A Clerk user ID is a text string
-- like "user_2ab...". That ID is the key that ties database rows to a person.
-- When a signed-in user talks to Supabase, their Clerk token carries that ID in
-- the JWT "sub" claim, readable in SQL as: auth.jwt() ->> 'sub'.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- A lightweight profile row per user. Clerk remains the source of truth for
-- login; this table lets us attach app data (and later, joins) to a user.
create table if not exists public.users (
  id         text primary key,                       -- Clerk user ID (JWT "sub")
  email      text,
  created_at timestamptz not null default now()
);

-- Tickers a user saves. The portfolio UI comes in the NEXT step; here we only
-- create the structure.
create table if not exists public.saved_stocks (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null references public.users (id) on delete cascade,
  ticker     text not null,
  created_at timestamptz not null default now(),
  unique (user_id, ticker)                           -- no duplicate saves
);

create index if not exists saved_stocks_user_id_idx
  on public.saved_stocks (user_id);

-- ---------------------------------------------------------------------------
-- Row Level Security (RLS)
-- ---------------------------------------------------------------------------
-- With RLS ON and the policies below, the database itself refuses any read or
-- write unless the requester's Clerk ID matches the row's owner. Even if a key
-- leaked, no one could read another user's rows. Unauthenticated requests match
-- no policy at all, so they get nothing (logged-out users never hit these
-- tables anyway). The service-role key bypasses RLS and is only ever used for
-- admin/migrations on the server — never in the app.

alter table public.users        enable row level security;
alter table public.saved_stocks enable row level security;

-- users: a person may only see/create/update THEIR OWN profile row.
create policy "own profile: select"
  on public.users for select to authenticated
  using ((auth.jwt() ->> 'sub') = id);

create policy "own profile: insert"
  on public.users for insert to authenticated
  with check ((auth.jwt() ->> 'sub') = id);

create policy "own profile: update"
  on public.users for update to authenticated
  using ((auth.jwt() ->> 'sub') = id)
  with check ((auth.jwt() ->> 'sub') = id);

-- saved_stocks: a person may only see/add/remove THEIR OWN saved tickers.
create policy "own saves: select"
  on public.saved_stocks for select to authenticated
  using ((auth.jwt() ->> 'sub') = user_id);

create policy "own saves: insert"
  on public.saved_stocks for insert to authenticated
  with check ((auth.jwt() ->> 'sub') = user_id);

create policy "own saves: delete"
  on public.saved_stocks for delete to authenticated
  using ((auth.jwt() ->> 'sub') = user_id);
