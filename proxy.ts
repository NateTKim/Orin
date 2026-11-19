import { clerkMiddleware } from "@clerk/nextjs/server";

// Next 16 renamed the "middleware" file convention to "proxy" (middleware.ts is
// deprecated and slated for removal in Next 17). Same behavior, new filename:
// the default export runs on every matched request.
//
// clerkMiddleware() attaches Clerk's auth context so that `auth()` works in
// server code (client components read auth state with the useUser() hook).
//
// IMPORTANT: on its own it does NOT protect or gate anything — every route
// stays public. Logged-out users can still look up tickers exactly as before.
// Account-specific access is enforced in the server actions + RLS, not here.
export default clerkMiddleware();

export const config = {
  matcher: [
    // Run on everything except Next.js internals and static files,
    // unless they show up as search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpg|jpeg|gif|png|svg|ico|webp|woff2?|ttf|map)).*)",
    // Always run on API routes.
    "/(api|trpc)(.*)",
  ],
};
