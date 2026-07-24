"use client";

import { useMemo } from "react";
import { Activity } from "lucide-react";
import { computeBusinessHealth } from "@/lib/health/score.ts";
import type { HealthFactor } from "@/lib/health/score.ts";
import { HEALTH_COLORS } from "@/lib/health/colors.ts";
import type { FilingSnapshot } from "@/lib/edgar/types.ts";
import { cn } from "@/lib/utils";

function FactorChip({ factor }: { factor: HealthFactor }) {
  const arrow = factor.direction === "up" ? "↑" : factor.direction === "down" ? "↓" : "→";
  const tone =
    factor.sentiment === "positive"
      ? "text-up"
      : factor.sentiment === "negative"
        ? "text-down"
        : "text-sand-500";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-sand-50 px-2.5 py-1 text-xs ring-1 ring-sand-900/8">
      <span className={cn("font-semibold", tone)} aria-hidden>
        {arrow}
      </span>
      <span className="font-medium text-foreground/80">{factor.label}</span>
      <span className="text-muted-foreground">· {factor.detail}</span>
    </span>
  );
}

/**
 * Business Health — a glanceable, deterministic read on how the company's
 * BUSINESS is performing, computed from the extracted filing metrics (see
 * lib/health/score.ts). Explicitly NOT a stock rating: the framing line and
 * the score itself only ever describe business performance, never the stock.
 */
export function BusinessHealth({ snapshot }: { snapshot: FilingSnapshot }) {
  const health = useMemo(() => computeBusinessHealth(snapshot), [snapshot]);

  // Honest "not enough data" state — never a misleading score.
  if (!health.available || health.score === null || health.label === null) {
    return (
      <section
        aria-label="Business health"
        className="rounded-2xl bg-card p-5 shadow-card ring-1 ring-sand-900/8 sm:p-6"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-sand-100 ring-1 ring-sand-200">
            <Activity className="size-4 text-sand-500" aria-hidden />
          </span>
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold tracking-tight">Business health</h2>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              There isn&apos;t enough reported history in this filing to assess the company&apos;s
              business health yet. This can happen with recently public companies or filings
              missing key figures — we&apos;d rather say so than show a misleading score.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const accent = HEALTH_COLORS[health.label];

  return (
    <section
      aria-label="Business health"
      className="rounded-2xl bg-card p-5 shadow-card ring-1 ring-sand-900/8 sm:p-6"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-stretch sm:gap-6">
        {/* Score tile — glanceable in under a second */}
        <div
          className={cn(
            "flex shrink-0 flex-col items-center justify-center rounded-2xl px-7 py-4 ring-1",
            accent.tile,
          )}
        >
          <div className="flex items-baseline gap-1">
            <span className="font-display text-4xl font-medium tabular-nums text-foreground">
              {health.score}
            </span>
            <span className="text-sm text-muted-foreground">/10</span>
          </div>
          <span className={cn("mt-0.5 text-sm font-semibold", accent.text)}>{health.label}</span>
        </div>

        {/* Detail: heading, timeframe framing, plain-English why, factors */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={cn("inline-block size-2 shrink-0 rounded-full", accent.dot)}
                aria-hidden
              />
              <h2 className="text-sm font-semibold tracking-tight">Business health</h2>
            </div>
            {/* Anchors the score in time so a strong quarter isn't read as a
                permanent verdict on the company. */}
            <p className="mt-1 text-xs text-muted-foreground">
              Based on this report compared with the same period a year ago.
            </p>
          </div>

          <p className="text-[15px] leading-6 text-foreground/90">{health.why}</p>

          <div className="flex flex-wrap gap-2">
            {health.factors.map((f) => (
              <FactorChip key={f.key} factor={f} />
            ))}
          </div>

          <p className="text-xs leading-5 text-muted-foreground">
            A read on how this business is performing, based only on figures from its SEC
            filings. It is not a stock rating, a prediction, or a recommendation to buy, sell,
            or hold.
          </p>
        </div>
      </div>
    </section>
  );
}
