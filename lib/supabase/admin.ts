import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role Supabase client. This key BYPASSES Row Level Security, so it is
// only for server-side, non-user-scoped data — here, the shared filing cache
// that every visitor (logged in or not) benefits from.
//
// The `import "server-only"` above makes the build fail if this file is ever
// pulled into client-side code, which keeps the service-role key off the
// browser. It is also never referenced by any client component.
export function createSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
