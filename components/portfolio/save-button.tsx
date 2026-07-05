"use client";

import { useEffect, useState, useTransition } from "react";
import { SignInButton, useUser } from "@clerk/nextjs";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isStockSaved, removeStock, saveStock } from "@/lib/portfolio/actions.ts";
import type { SavedStockInput } from "@/lib/portfolio/types.ts";

const baseClasses = "gap-2 rounded-xl";
const outlineClasses = "border-white/10 bg-background/40";

/**
 * Save / Saved toggle for the results screen.
 * - Logged out: renders a "Sign in to save" button that opens Clerk's modal.
 * - Logged in: checks whether this filing's company is already saved, then
 *   toggles it. Optimistic-ish: we flip state after the server action confirms.
 */
export function SaveButton(props: SavedStockInput) {
  const { isLoaded, isSignedIn } = useUser();
  const [saved, setSaved] = useState(false);
  const [known, setKnown] = useState(false); // has the initial saved-state loaded?
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let active = true;
    setKnown(false);
    isStockSaved(props.ticker).then((s) => {
      if (active) {
        setSaved(s);
        setKnown(true);
      }
    });
    return () => {
      active = false;
    };
  }, [isLoaded, isSignedIn, props.ticker]);

  // Still resolving auth — show a disabled placeholder to avoid a flash.
  if (!isLoaded) {
    return (
      <span
        aria-hidden
        className={cn(
          buttonVariants({ variant: "outline", size: "lg" }),
          baseClasses,
          outlineClasses,
          "pointer-events-none opacity-50",
        )}
      >
        <Bookmark className="size-4" />
        Save
      </span>
    );
  }

  // Logged out — prompt sign-in instead of saving (intentional signup incentive).
  if (!isSignedIn) {
    return (
      <SignInButton mode="modal">
        <button
          className={cn(buttonVariants({ variant: "outline", size: "lg" }), baseClasses, outlineClasses)}
        >
          <Bookmark className="size-4" aria-hidden />
          Sign in to save
        </button>
      </SignInButton>
    );
  }

  function toggle() {
    startTransition(async () => {
      if (saved) {
        const r = await removeStock(props.ticker);
        if (r.ok) setSaved(false);
      } else {
        const r = await saveStock(props);
        if (r.ok) setSaved(true);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending || !known}
      aria-pressed={saved}
      className={cn(
        buttonVariants({ variant: saved ? "default" : "outline", size: "lg" }),
        baseClasses,
        !saved && outlineClasses,
        (pending || !known) && "opacity-70",
      )}
    >
      {saved ? (
        <BookmarkCheck className="size-4" aria-hidden />
      ) : (
        <Bookmark className="size-4" aria-hidden />
      )}
      {saved ? "Saved" : "Save"}
    </button>
  );
}
