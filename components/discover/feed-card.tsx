"use client";

import Link from "next/link";
import { SignInButton } from "@clerk/nextjs";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FeedItem } from "@/lib/discover/types.ts";

const cardShell = "rounded-2xl bg-card ring-1 ring-sand-900/8 shadow-card";

/** Neutral, factual "how recently" label from a filing date. */
function filedAgo(iso: string): string {
  const filed = new Date(`${iso}T00:00:00Z`).getTime();
  const days = Math.floor((Date.now() - filed) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "1 week ago";
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  const months = Math.floor(days / 30);
  return months <= 1 ? "1 month ago" : `${months} months ago`;
}

/**
 * One company in the discovery feed. Presentational: the whole card links to
 * the full analysis (/?ticker=…); the save control is a sibling of the link so
 * it never triggers navigation. Structured with a FUTURE CONTENT slot so richer
 * content (a preview insight, revenue-direction chip, etc.) can be added later
 * without touching the page — same approach as the portfolio cards.
 *
 * Framing is deliberately neutral: "New report · filed 3 days ago" — never a
 * buy/sell signal.
 */
export function FeedCard({
  item,
  isSignedIn,
  saved,
  pending,
  onToggleSave,
}: {
  item: FeedItem;
  isSignedIn: boolean;
  saved: boolean;
  pending: boolean;
  onToggleSave: () => void;
}) {
  return (
    <div className="group relative">
      <Link
        href={`/?ticker=${encodeURIComponent(item.ticker)}`}
        className={cn(
          cardShell,
          "block p-5 transition-colors hover:ring-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        )}
      >
        <div className="flex items-start gap-3">
          <span className="rounded-md bg-accent px-2 py-0.5 text-sm font-medium tracking-wide text-accent-foreground ring-1 ring-brand-100">
            {item.ticker}
          </span>
          {/* right side kept clear for the save control (absolute, below) */}
        </div>

        <h3 className="mt-3 line-clamp-2 text-base font-semibold leading-snug tracking-tight">
          {item.companyName}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          New report · {item.form} · filed {filedAgo(item.filedDate)}
        </p>

        {/* FUTURE CONTENT: preview insight / revenue-direction / "new filing"
            emphasis can drop in here without changing the grid or page. */}
      </Link>

      {/* Save control — reflects portfolio membership for signed-in users, or
          prompts sign-in for logged-out visitors (returning them to the feed). */}
      {isSignedIn ? (
        <button
          type="button"
          onClick={onToggleSave}
          disabled={pending}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${item.ticker} from your portfolio` : `Save ${item.ticker} to your portfolio`}
          className={cn(
            "absolute right-3 top-3 flex size-8 items-center justify-center rounded-lg ring-1 backdrop-blur transition-colors",
            saved
              ? "bg-brand-100 text-brand-700 ring-brand-200"
              : "bg-card/90 text-muted-foreground shadow-card ring-sand-900/10 hover:text-foreground",
            pending && "opacity-60",
          )}
        >
          {saved ? <BookmarkCheck className="size-4" aria-hidden /> : <Bookmark className="size-4" aria-hidden />}
        </button>
      ) : (
        <SignInButton mode="modal" forceRedirectUrl="/discover" signUpForceRedirectUrl="/discover">
          <button
            type="button"
            aria-label={`Sign in to save ${item.ticker}`}
            className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-lg bg-card/90 text-muted-foreground shadow-card ring-1 ring-sand-900/10 backdrop-blur transition-colors hover:text-foreground"
          >
            <Bookmark className="size-4" aria-hidden />
          </button>
        </SignInButton>
      )}
    </div>
  );
}
