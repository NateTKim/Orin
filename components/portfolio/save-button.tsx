"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { SignInButton, SignUpButton, useUser } from "@clerk/nextjs";
import { Popover } from "@base-ui/react/popover";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isStockSaved, removeStock, saveStock } from "@/lib/portfolio/actions.ts";
import type { SavedStockInput } from "@/lib/portfolio/types.ts";

const baseClasses = "gap-2 rounded-xl";
const outlineClasses = "bg-card";

/**
 * Save / Saved toggle for the results screen.
 * - Logged out: the button opens a warm, benefit-framed popover ("keep this
 *   company") rather than a bare sign-in wall. Signing up (or in) carries the
 *   intended save through via a one-shot `?save=1` param, so the action the
 *   user started completes automatically instead of being lost.
 * - Logged in: checks whether this filing's company is already saved, then
 *   toggles it. We flip state after the server action confirms.
 */
export function SaveButton(props: SavedStockInput) {
  const { isLoaded, isSignedIn } = useUser();
  const [saved, setSaved] = useState(false);
  const [known, setKnown] = useState(false); // has the initial saved-state loaded?
  const [pending, startTransition] = useTransition();

  // Carry-through intent from the auth redirect (`?save=1`). Read reactively so
  // that whichever settles LAST after auth — the Clerk session flipping
  // isSignedIn, or Clerk navigating to add the param — re-triggers the effect
  // with both in place. (A one-time window.location read races the two and, on
  // the fast sign-in path, runs before the URL carries the param.)
  const searchParams = useSearchParams();
  const wantsAutoSave = searchParams.get("save") === "1";
  const autoSaveTriggered = useRef(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let active = true;
    setKnown(false);
    isStockSaved(props.ticker).then((alreadySaved) => {
      if (!active) return;

      if (wantsAutoSave && !alreadySaved && !autoSaveTriggered.current) {
        // Finish the save the user set out to make before authenticating.
        autoSaveTriggered.current = true; // once only, even if the effect re-runs
        setSaved(false); // show "Save" until the auto-save confirms, then flip
        saveStock(props).then((r) => {
          if (active && r.ok) setSaved(true);
        });
        // Consume the one-shot intent so a manual refresh can't replay it.
        const params = new URLSearchParams(window.location.search);
        params.delete("save");
        const qs = params.toString();
        window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
      } else {
        setSaved(alreadySaved);
      }
      setKnown(true);
    });
    return () => {
      active = false;
    };
    // Re-runs when auth, the ticker, or the save-intent param changes; `props`
    // is stable per ticker on this screen. The ref guard keeps the auto-save to
    // a single fire regardless of how many times the effect runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, props.ticker, wantsAutoSave]);

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

  // Logged out — reframe "Save" as "keep something you've found valuable".
  // Both auth paths return to THIS stock with `save=1` so the save completes
  // itself after account creation (and going straight to the destination also
  // avoids the "/"-redirect hang after a modal sign-in).
  if (!isSignedIn) {
    const saveUrl = `/?ticker=${encodeURIComponent(props.ticker)}&save=1`;
    return (
      <Popover.Root>
        <Popover.Trigger
          render={
            <button
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                baseClasses,
                outlineClasses,
              )}
            >
              <Bookmark className="size-4" aria-hidden />
              Save
            </button>
          }
        />
        <Popover.Portal>
          <Popover.Positioner side="bottom" align="end" sideOffset={10}>
            <Popover.Popup
              className={cn(
                "w-[19rem] max-w-[calc(100vw-2rem)] rounded-2xl bg-popover p-5 text-left text-popover-foreground shadow-card-lg ring-1 ring-sand-900/10 outline-none",
                "origin-[var(--transform-origin)] transition-[transform,opacity] duration-150",
                "data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
                "data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
              )}
            >
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-lg bg-brand-50 ring-1 ring-brand-100">
                  <Bookmark className="size-4 text-brand-700" aria-hidden />
                </span>
                <h3 className="text-sm font-semibold tracking-tight text-foreground">
                  Keep {props.ticker} in your portfolio
                </h3>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {/* Explicit {" "} around the name: the JSX transform here strips
                    a plain space between an expression and adjacent text. */}
                Create a free account to save{" "}
                {props.companyName}
                {" "}and jump straight back to its full breakdown anytime. It&apos;s free.
              </p>
              <SignUpButton
                mode="modal"
                forceRedirectUrl={saveUrl}
                signInForceRedirectUrl={saveUrl}
              >
                <Button size="lg" className="mt-4 w-full rounded-xl">
                  Create a free account
                </Button>
              </SignUpButton>
              <p className="mt-2.5 text-center text-xs text-muted-foreground">
                Already have an account?{" "}
                <SignInButton
                  mode="modal"
                  forceRedirectUrl={saveUrl}
                  signUpForceRedirectUrl={saveUrl}
                >
                  <button className="font-medium text-primary underline-offset-4 hover:underline">
                    Sign in
                  </button>
                </SignInButton>
              </p>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
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
