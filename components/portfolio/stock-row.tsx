"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SavedStockWithHealth } from "@/lib/portfolio/types.ts";
import { CompanyLogo } from "./company-logo";
import { HealthPill } from "./health-pill";

function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * Compact list row — the denser alternative to the card grid. Built as a
 * flex row (not a wide <table>) so it reads cleanly on mobile: logo + name on
 * the left, health + filing meta on the right, wrapping as needed.
 */
export function StockRow({
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
          "flex items-center gap-3 rounded-xl bg-card px-4 py-3 ring-1 ring-sand-900/8 shadow-card transition-colors",
          "hover:ring-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        )}
      >
        <CompanyLogo ticker={stock.ticker} companyName={stock.companyName} className="size-9 text-base" />

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold tracking-tight">{stock.companyName}</span>
            {stock.hasNewerFiling && (
              <span
                className="size-1.5 shrink-0 rounded-full bg-brand-600"
                aria-label="New filing available"
                title="New filing available"
              />
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {stock.ticker}
            <span className="hidden sm:inline">
              {" · "}
              {stock.form ? `${stock.form} ` : ""}
              {formatDate(stock.filedDate)}
            </span>
          </span>
        </div>

        <HealthPill health={stock.health} className="shrink-0" />
        {/* spacer so the hover remove control never overlaps the pill */}
        <span className="w-6 shrink-0" aria-hidden />
      </Link>

      <button
        type="button"
        onClick={() => onRemove(stock.ticker)}
        disabled={removing}
        aria-label={`Remove ${stock.ticker} from your portfolio`}
        className={cn(
          "absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-lg bg-card/90 text-muted-foreground ring-1 ring-sand-900/10 backdrop-blur",
          "opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100",
          removing && "opacity-100",
        )}
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
