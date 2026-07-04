import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

// Server-only Supabase client. Not imported by any client component, so the
// keys here never ship to the browser. (The anon key is public-safe anyway;
// the service-role key is never used in app code.)
//
// How per-user security works WITHOUT a secret key: we attach the signed-in
// user's Clerk token to each request via `accessToken`. Supabase verifies that
// token (once you connect Clerk as a third-party auth provider — see the
// dashboard steps) and exposes the Clerk user ID as `auth.jwt()->>'sub'`. Our
// Row Level Security policies compare that to each row's `user_id`, so a user
// can only ever read or write their own rows — enforced by the database, not
// by us remembering to filter.
//
// Not wired into any route yet; this is the foundation for the next step
// (saving a portfolio).
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
