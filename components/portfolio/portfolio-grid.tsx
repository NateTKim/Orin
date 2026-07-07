"use client";

import { useState, useTransition } from "react";
import { Bookmark } from "lucide-react";
import { removeStock } from "@/lib/portfolio/actions.ts";
import type { SavedStock } from "@/lib/portfolio/types.ts";
import { StockCard } from "./stock-card";

/**
 * Renders the saved companies as a responsive grid, or a friendly empty state.
 * The list lives in client state seeded from the server, so removing a card
 * updates instantly (then the server action deletes the row).
 */
export function PortfolioGrid({ initialStocks }: { initialStocks: SavedStock[] }) {
  const [stocks, setStocks] = useState(initialStocks);
  const [removingTicker, setRemovingTicker] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleRemove(ticker: string) {
    setRemovingTicker(ticker);
    startTransition(async () => {
      const result = await removeStock(ticker);
      if (result.ok) {
        setStocks((prev) => prev.filter((s) => s.ticker !== ticker));
      }
      setRemovingTicker(null);
    });
  }

  if (stocks.length === 0) return <EmptyState />;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {stocks.map((stock) => (
        <StockCard
          key={stock.ticker}
          stock={stock}
          onRemove={handleRemove}
          removing={removingTicker === stock.ticker}
        />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl bg-card px-6 py-16 text-center shadow-card ring-1 ring-sand-900/8">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-50 ring-1 ring-brand-100">
        <Bookmark className="size-6 text-brand-700" aria-hidden />
      </span>
      <h2 className="text-lg font-semibold tracking-tight">Your portfolio is empty</h2>
      <p className="max-w-sm text-sm leading-6 text-muted-foreground">
        Search for a company and tap <span className="font-medium text-foreground">Save</span> to
        add it here. Next time, you&apos;ll jump straight to its analysis.
      </p>
      <a
        href="#dashboard-search"
        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Search for a company →
      </a>
    </div>
  );
}
