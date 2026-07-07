"use client";

import { useState, useTransition } from "react";
import { useUser } from "@clerk/nextjs";
import { removeStock, saveStock } from "@/lib/portfolio/actions.ts";
import type { FeedItem } from "@/lib/discover/types.ts";
import { FeedCard } from "./feed-card";

/**
 * Renders the discovery feed grid and owns the "which of these am I already
 * saving" state (seeded once from the server, so we don't make one request per
 * card). Saving/removing from a card reuses the same portfolio server actions
 * as the results screen, with an optimistic toggle.
 */
export function DiscoverFeed({
  items,
  initialSavedTickers,
}: {
  items: FeedItem[];
  initialSavedTickers: string[];
}) {
  const { isSignedIn } = useUser();
  const [saved, setSaved] = useState<Set<string>>(() => new Set(initialSavedTickers));
  const [pendingTicker, setPendingTicker] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function toggleSave(item: FeedItem) {
    const wasSaved = saved.has(item.ticker);
    setPendingTicker(item.ticker);
    setSaved((prev) => {
      const next = new Set(prev);
      if (wasSaved) next.delete(item.ticker);
      else next.add(item.ticker);
      return next;
    });

    startTransition(async () => {
      const result = wasSaved
        ? await removeStock(item.ticker)
        : await saveStock({
            ticker: item.ticker,
            companyName: item.companyName,
            accessionNumber: item.accessionNumber,
            form: item.form,
            filedDate: item.filedDate,
          });
      if (!result.ok) {
        // Revert the optimistic change on failure.
        setSaved((prev) => {
          const next = new Set(prev);
          if (wasSaved) next.add(item.ticker);
          else next.delete(item.ticker);
          return next;
        });
      }
      setPendingTicker(null);
    });
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl bg-card px-6 py-12 text-center text-sm text-muted-foreground shadow-card ring-1 ring-sand-900/8">
        We couldn&apos;t load recent filings right now. Please try again in a moment.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <FeedCard
          key={item.ticker}
          item={item}
          isSignedIn={Boolean(isSignedIn)}
          saved={saved.has(item.ticker)}
          pending={pendingTicker === item.ticker}
          onToggleSave={() => toggleSave(item)}
        />
      ))}
    </div>
  );
}
