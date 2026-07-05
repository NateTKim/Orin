"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SavedStock } from "@/lib/portfolio/types.ts";

const cardShell =
  "rounded-2xl bg-gradient-to-b from-white/[0.03] to-transparent ring-1 ring-white/10 shadow-[0_8px_30px_rgba(0,0,0,0.35)]";

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
 * One saved company. Deliberately minimal for now, but structured so richer
 * content drops in without rebuilding the page or the dashboard:
 *
 *   • the header row has room on the right for a "new filing" badge
 *   • the FUTURE CONTENT slot below the meta line is where a preview insight,
 *     a revenue-direction chip, etc. will go
 *
 * The whole card is a link to the full analysis (/?ticker=…). The remove
 * control is a sibling of the link (not nested inside it) so clicking remove
 * never triggers navigation.
 */
export function StockCard({
  stock,
  onRemove,
  removing,
}: {
  stock: SavedStock;
  onRemove: (ticker: string) => void;
  removing: boolean;
}) {
  return (
    <div className="group relative">
      <Link
        href={`/?ticker=${encodeURIComponent(stock.ticker)}`}
        className={cn(
          cardShell,
          "block p-5 transition-colors hover:ring-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="rounded-md bg-primary/15 px-2 py-0.5 text-sm font-medium tracking-wide text-accent-foreground">
            {stock.ticker}
          </span>
          {/* FUTURE SLOT: "new filing" badge goes here (space reserved on the right). */}
        </div>

        <h3 className="mt-3 line-clamp-2 text-base font-semibold leading-snug tracking-tight">
          {stock.companyName}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Latest report{stock.form ? ` (${stock.form})` : ""} · {formatDate(stock.filedDate)}
        </p>

        {/* FUTURE CONTENT: preview insight line, revenue-direction indicator,
            etc. Add elements here — the card and grid won't need changes. */}
      </Link>

      <button
        type="button"
        onClick={() => onRemove(stock.ticker)}
        disabled={removing}
        aria-label={`Remove ${stock.ticker} from your portfolio`}
        className={cn(
          "absolute right-3 top-3 flex size-7 items-center justify-center rounded-lg bg-background/70 text-muted-foreground ring-1 ring-white/10 backdrop-blur",
          "opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100",
          removing && "opacity-100",
        )}
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
