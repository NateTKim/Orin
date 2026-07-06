"use client";

import Link from "next/link";
import { SignInButton, SignUpButton, UserButton, useUser } from "@clerk/nextjs";
import { LayoutGrid } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Logged out: "Sign in" + "Create account" (Clerk opens a themed modal).
 * Logged in: a "Portfolio" link to the dashboard + Clerk's account menu
 * (which handles sign-out). The Portfolio link only ever renders for signed-in
 * users, so logged-out visitors never see the dashboard entry point.
 *
 * `showDashboardLink` is turned off on the dashboard itself (you're already
 * there). We branch with the `useUser()` client hook because Clerk v7's server
 * <Show> component can't run inside a client component.
 */
export function AuthControls({ showDashboardLink = true }: { showDashboardLink?: boolean }) {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) {
    return <div aria-hidden className="size-8 rounded-full bg-foreground/5" />;
  }

  if (isSignedIn) {
    return (
      <div className="flex items-center gap-2">
        {showDashboardLink && (
          <Link
            href="/dashboard"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5 rounded-lg")}
          >
            <LayoutGrid className="size-4" aria-hidden />
            Portfolio
          </Link>
        )}
        <UserButton appearance={{ elements: { userButtonAvatarBox: "h-8 w-8" } }} />
      </div>
    );
  }

  // After auth, go straight to the dashboard. Without this, Clerk returns to
  // "/", whose server-side redirect to /dashboard hangs during the soft
  // navigation that follows a modal sign-in.
  return (
    <div className="flex items-center gap-2">
      <SignInButton
        mode="modal"
        forceRedirectUrl="/dashboard"
        signUpForceRedirectUrl="/dashboard"
      >
        <button className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "rounded-lg")}>
          Sign in
        </button>
      </SignInButton>
      <SignUpButton
        mode="modal"
        forceRedirectUrl="/dashboard"
        signInForceRedirectUrl="/dashboard"
      >
        <button className={cn(buttonVariants({ size: "sm" }), "rounded-lg")}>Create account</button>
      </SignUpButton>
    </div>
  );
}
