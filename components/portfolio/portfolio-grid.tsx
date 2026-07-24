"use client";

import { useEffect, useState, useTransition } from "react";
import { Bookmark, CloudOff, LayoutGrid, List } from "lucide-react";
import { checkForNewFilings, removeStock } from "@/lib/portfolio/actions.ts";
import type { SavedStockWithHealth } from "@/lib/portfolio/types.ts";
import { cn } from "@/lib/utils";
import { StockCard } from "./stock-card";
import { StockRow } from "./stock-row";

type ViewMode = "grid" | "list";

/**
 * Renders the saved companies as a card grid or a compact list, or a friendly
 * empty state. The list lives in client state seeded from the server, so
 * removing a card updates instantly (then the server action deletes the row).
 *
 * After first paint we run ONE lazy, EDGAR-only check (checkForNewFilings) to
 * flag companies with a filing newer than the saved one — non-blocking, no
 * Claude, degrades to no-badge on failure.
 */
export function PortfolioGrid({ initialStocks }: { initialStocks: SavedStockWithHealth[] }) {
  const [stocks, setStocks] = useState(initialStocks);
  const [removingTicker, setRemovingTicker] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("grid");
  const [, startTransition] = useTransition();

  // Lazy "new filing available" check — runs once, after the dashboard has
  // already painted with cached health scores. EDGAR-only (no analysis).
  useEffect(() => {
    if (initialStocks.length === 0) return;
    let active = true;
    const saved = initialStocks.map((s) => ({
      ticker: s.ticker,
      accessionNumber: s.accessionNumber,
    }));
    checkForNewFilings(saved)
      .then((map) => {
        if (!active) return;
        setStocks((prev) => prev.map((s) => ({ ...s, hasNewerFiling: map[s.ticker] ?? false })));
      })
      .catch(() => {
        /* no badges on failure — non-critical */
      });
    return () => {
      active = false;
    };
  }, [initialStocks]);

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
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {stocks.length} {stocks.length === 1 ? "company" : "companies"}
        </p>
        <ViewToggle view={view} onChange={setView} />
      </div>

      {view === "grid" ? (
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
      ) : (
        <div className="flex flex-col gap-2">
          {stocks.map((stock) => (
            <StockRow
              key={stock.ticker}
              stock={stock}
              onRemove={handleRemove}
              removing={removingTicker === stock.ticker}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  const base = "flex size-8 items-center justify-center rounded-lg transition-colors";
  return (
    <div className="flex items-center gap-1 rounded-xl bg-sand-100 p-1 ring-1 ring-sand-900/8">
      <button
        type="button"
        onClick={() => onChange("grid")}
        aria-label="Grid view"
        aria-pressed={view === "grid"}
        className={cn(base, view === "grid" ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:text-foreground")}
      >
        <LayoutGrid className="size-4" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => onChange("list")}
        aria-label="List view"
        aria-pressed={view === "list"}
        className={cn(base, view === "list" ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:text-foreground")}
      >
        <List className="size-4" aria-hidden />
      </button>
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
        {/* Explicit {" "} so the JSX transform can never swallow the spaces
            around the styled word. */}
        Search for a company and tap{" "}
        <span className="font-medium text-foreground">Save</span>{" "}
        to add it here. Next time, you&apos;ll jump straight to its analysis.
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

/**
 * Shown when the saved list failed to LOAD (a Supabase error), as opposed to
 * the genuine empty state above. Kept soft and reassuring — the data is likely
 * fine, the read just hiccupped — so a user with saves doesn't think they
 * vanished. Same card language as EmptyState.
 */
export function PortfolioLoadError() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl bg-card px-6 py-16 text-center shadow-card ring-1 ring-sand-900/8">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-sand-100 ring-1 ring-sand-200">
        <CloudOff className="size-6 text-sand-600" aria-hidden />
      </span>
      <h2 className="text-lg font-semibold tracking-tight">We couldn&apos;t load your portfolio</h2>
      <p className="max-w-sm text-sm leading-6 text-muted-foreground">
        This is on our end, not yours — your saved companies are safe. Please refresh the page
        to try again.
      </p>
    </div>
  );
}
