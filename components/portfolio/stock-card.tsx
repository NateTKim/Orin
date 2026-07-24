"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SavedStockWithHealth } from "@/lib/portfolio/types.ts";
import { CompanyLogo } from "./company-logo";
import { HealthPill } from "./health-pill";

const cardShell = "rounded-2xl bg-card ring-1 ring-sand-900/8 shadow-card";

function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * One saved company, as a rich card: logo, name + ticker, Business Health at a
 * glance, latest filing meta, and a "new filing" indicator when EDGAR shows one
 * newer than what was saved. The whole card links to the full analysis; the
 * remove control is a sibling of the link (not nested) so removing never
 * triggers navigation.
 */
export function StockCard({
  stock,
  onRemove,
  removing,
}: {
  stock: SavedStockWithHealth;
  onRemove: (ticker: string) => void;
  removing: boolean;
}) {
  return (
    <div className="group relative">
      <Link
        href={`/?ticker=${encodeURIComponent(stock.ticker)}`}
        className={cn(
          cardShell,
          "flex flex-col gap-4 p-5 transition-colors hover:ring-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        )}
      >
        {/* Header: logo + name/ticker. Right padding leaves room for the
            remove control that appears on hover (absolute, below). */}
        <div className="flex items-center gap-3 pr-8">
          <CompanyLogo ticker={stock.ticker} companyName={stock.companyName} />
          <div className="flex min-w-0 flex-col">
            <h3 className="truncate text-base font-semibold leading-snug tracking-tight">
              {stock.companyName}
            </h3>
            <span className="text-xs font-medium tracking-wide text-muted-foreground">
              {stock.ticker}
            </span>
          </div>
        </div>

        {/* Business health — the reason to glance at this page. self-start so
            the pill hugs its content instead of stretching the column width. */}
        <HealthPill health={stock.health} className="self-start" />

        {/* Filing meta + new-filing indicator. flex-wrap so the badge drops
            below the (potentially long) filing line on narrow cards. */}
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 border-t border-border pt-3">
          <span className="min-w-0 text-xs text-muted-foreground">
            Latest report{stock.form ? ` (${stock.form})` : ""} · {formatDate(stock.filedDate)}
          </span>
          {stock.hasNewerFiling && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 ring-1 ring-brand-100">
              <span className="size-1.5 rounded-full bg-brand-600" aria-hidden />
              New filing
            </span>
          )}
        </div>
      </Link>

      <button
        type="button"
        onClick={() => onRemove(stock.ticker)}
        disabled={removing}
        aria-label={`Remove ${stock.ticker} from your portfolio`}
        className={cn(
          "absolute right-3 top-3 flex size-7 items-center justify-center rounded-lg bg-card/90 text-muted-foreground shadow-card ring-1 ring-sand-900/10 backdrop-blur",
          "opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100",
          removing && "opacity-100",
        )}
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
