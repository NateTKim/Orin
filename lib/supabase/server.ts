import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

// Per-user Supabase client for server code (the portfolio server actions). It
// uses only the public-safe anon key; the RLS-bypassing service-role client
// lives separately in admin.ts.
//
// How per-user security works WITHOUT a secret key: we attach the signed-in
// user's Clerk token to each request via `accessToken`. Supabase verifies that
// token (once you connect Clerk as a third-party auth provider — see the
// dashboard steps) and exposes the Clerk user ID as `auth.jwt()->>'sub'`. Our
// Row Level Security policies compare that to each row's `user_id`, so a user
// can only ever read or write their own rows — enforced by the database, not
// by us remembering to filter.
export function createSupabaseServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      async accessToken() {
        return (await auth()).getToken();
      },
    },
  );
}
