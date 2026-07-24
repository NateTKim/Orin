import { HEALTH_COLORS } from "@/lib/health/colors.ts";
import type { HealthResult } from "@/lib/health/score.ts";
import { cn } from "@/lib/utils";

/**
 * Compact Business Health badge for the dashboard. Display-only (never a link):
 * it lives inside an already-clickable card/row, so nesting an anchor here would
 * be invalid HTML. Three states:
 *  - scored: "8 · Strengthening" in the label's color
 *  - not enough data: a calm neutral "Limited data" chip
 *  - null (filing not analyzed yet): an inviting "Open to see health" hint — the
 *    surrounding card link takes the user in (which runs + caches the analysis);
 *    we never imply a score we haven't computed and never auto-run analysis.
 */
export function HealthPill({ health, className }: { health: HealthResult | null; className?: string }) {
  if (health && health.available && health.score !== null && health.label) {
    const c = HEALTH_COLORS[health.label];
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1",
          c.pill,
          className,
        )}
        title={health.why ?? undefined}
      >
        <span className="font-semibold tabular-nums">{health.score}</span>
        <span aria-hidden>·</span>
        {health.label}
      </span>
    );
  }

  if (health && !health.available) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full bg-sand-100 px-2.5 py-1 text-xs font-medium text-sand-500 ring-1 ring-sand-900/8",
          className,
        )}
      >
        Limited data
      </span>
    );
  }

  // Not analyzed yet — inviting hint; the card's own link does the navigating.
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 ring-1 ring-brand-100",
        className,
      )}
    >
      Open to see health
    </span>
  );
}
