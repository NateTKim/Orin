import "server-only";

// Lightweight in-memory sliding-window rate limiter for the analysis endpoint.
//
// WHY: an uncached filing analysis costs real money (a Claude call over a large
// filing excerpt) and holds a serverless function for up to a minute. Without a
// gate, anyone could iterate EDGAR's ~10k tickers and both run up the bill and
// exhaust our Anthropic rate limit so real users see "summary unavailable".
//
// SCOPE / TRADEOFF (deliberate): state lives in module memory, so each warm
// serverless instance has its own counters. This reliably stops a naive
// single-source spammer (who keeps hitting the same warm instance) but not a
// distributed attack. It's the zero-dependency 80/20; a Vercel Firewall rule or
// a shared Redis store are the heavier options if we ever need them.

/** Window length over which hits are counted. */
const WINDOW_MS = 5 * 60 * 1000; // 5 minutes
/** Max billable (uncached) analyses allowed per key per window. */
const MAX_HITS = 10;
/** Hard cap on tracked keys, so a flood of unique IPs can't grow memory without
 *  bound. When exceeded we sweep out keys whose hits have all expired. */
const MAX_KEYS = 10_000;

/** key -> ascending timestamps (ms) of recent counted hits, within the window. */
const hitsByKey = new Map<string, number[]>();

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the caller should retry (0 when allowed). */
  retryAfterSec: number;
}

/**
 * Record one hit for `key` and report whether it's within budget. Only call
 * this at the point work actually becomes expensive — cache hits and cheap
 * rejections must NOT consume budget, or normal browsing would be throttled.
 *
 * A denied call does NOT consume budget (we don't push the timestamp), so a
 * blocked client's window still drains normally rather than resetting on each
 * rejected attempt.
 */
export function recordAndCheck(key: string): RateLimitResult {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;

  // Prune this key's expired timestamps (keeps each array at most MAX_HITS+1).
  const recent = (hitsByKey.get(key) ?? []).filter((t) => t > cutoff);

  if (recent.length >= MAX_HITS) {
    hitsByKey.set(key, recent); // persist the pruned list
    const oldest = recent[0];
    const retryAfterSec = Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000));
    return { allowed: false, retryAfterSec };
  }

  recent.push(now);
  hitsByKey.set(key, recent);

  if (hitsByKey.size > MAX_KEYS) sweepExpired(cutoff);

  return { allowed: true, retryAfterSec: 0 };
}

/** Drop keys whose most-recent hit has aged out of the window. Runs only when
 *  the map exceeds MAX_KEYS, so its O(n) cost is amortized away. */
function sweepExpired(cutoff: number): void {
  for (const [key, timestamps] of hitsByKey) {
    const last = timestamps[timestamps.length - 1];
    if (last === undefined || last <= cutoff) hitsByKey.delete(key);
  }
}

/** Derive a rate-limit key from the request. Uses the first hop of
 *  `x-forwarded-for` (the client IP on Vercel), falling back to a shared
 *  "unknown" bucket when absent (local dev, odd proxies). */
export function clientKey(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  const first = fwd?.split(",")[0]?.trim();
  return first && first.length > 0 ? first : "unknown";
}

/** Test-only: clear all counters so tests don't leak state into each other. */
export function __resetRateLimitForTests(): void {
  hitsByKey.clear();
}
