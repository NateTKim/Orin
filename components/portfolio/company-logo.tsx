import { cn } from "@/lib/utils";

// Deterministic monogram badge — our logo treatment for saved companies.
//
// WHY A MONOGRAM (and not real logos): there is no clean, free, keyless,
// ticker-based logo API. The realistic options are a keyed service (logo.dev —
// needs a signup token) or a ticker→domain map piped into a favicon service
// (fragile + low-res). Rather than risk broken images, we render an on-brand
// monogram tinted deterministically from the ticker, so it always works, needs
// no network, and leaks nothing. This component is the single logo slot: to add
// real logos later, render an <img> here with an onError fallback to the
// monogram below — nothing else in the dashboard changes.

// Soft, warm, on-brand tints (no violet — we moved away from that). Chosen so
// the grid gets gentle variety without clashing with the palette.
const TINTS = [
  "bg-brand-100 text-brand-700",
  "bg-[oklch(0.93_0.045_150)] text-[oklch(0.45_0.1_150)]", // green
  "bg-[oklch(0.95_0.045_65)] text-[oklch(0.5_0.11_65)]", // amber
  "bg-[oklch(0.94_0.04_20)] text-[oklch(0.5_0.12_20)]", // rose
  "bg-[oklch(0.93_0.04_200)] text-[oklch(0.46_0.1_200)]", // teal
  "bg-sand-200 text-sand-700",
];

/** Stable index from the ticker so a company always gets the same tint. */
function tintFor(ticker: string): string {
  let hash = 0;
  for (let i = 0; i < ticker.length; i++) hash = (hash * 31 + ticker.charCodeAt(i)) >>> 0;
  return TINTS[hash % TINTS.length];
}

/** First letter of the company name (fallback ticker), for the monogram. */
function monogram(companyName: string, ticker: string): string {
  const source = companyName?.trim() || ticker;
  const ch = source.match(/[A-Za-z0-9]/)?.[0] ?? ticker.charAt(0);
  return ch.toUpperCase();
}

export function CompanyLogo({
  ticker,
  companyName,
  className,
}: {
  ticker: string;
  companyName: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-display font-medium",
        "size-10 text-lg",
        tintFor(ticker),
        className,
      )}
    >
      {monogram(companyName, ticker)}
    </span>
  );
}
