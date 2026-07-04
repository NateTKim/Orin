import { clerkMiddleware } from "@clerk/nextjs/server";

// clerkMiddleware() attaches Clerk's auth context to every matched request so
// that `auth()` works in server code and <SignedIn>/<SignedOut> work in the UI.
//
// IMPORTANT: on its own it does NOT protect or gate anything — every route
// stays public. Logged-out users can still look up tickers exactly as before.
// We'll only add route protection later, and only for account-specific
// endpoints (e.g. saving a portfolio).
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
