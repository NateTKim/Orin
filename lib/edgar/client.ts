// The single module that talks to SEC EDGAR. All EDGAR requests MUST go
// through fetchEdgarJson so the User-Agent header and rate limiting are
// enforced in exactly one place.

/** Thrown for any EDGAR request that doesn't yield usable JSON. */
export class EdgarError extends Error {
  /** HTTP status when the server responded; null for network-level failures. */
  readonly status: number | null;
  readonly url: string;

  // Note: no TS parameter properties here — scripts run on Node's strip-only
  // TypeScript mode, which rejects non-erasable syntax.
  constructor(message: string, status: number | null, url: string) {
    super(message);
    this.name = "EdgarError";
    this.status = status;
    this.url = url;
  }
}

function getSecUserAgent(): string {
  // Strip BOM/zero-width characters — env vars set via Windows tooling can
  // carry a leading U+FEFF, which is illegal in an HTTP header value.
  // eslint-disable-next-line no-misleading-character-class -- U+FEFF (BOM) and U+200B (zero-width space)
  const ua = process.env.SEC_USER_AGENT?.replace(/[﻿​]/g, "").trim();
  if (!ua || ua.trim() === "") {
    throw new Error(
      "SEC_USER_AGENT env var is not set. EDGAR blocks requests without it. " +
        'Set it in .env.local, format: "AppName your@email.com".',
    );
  }
  return ua;
}

// EDGAR allows max 10 req/s; we space sequential requests ~150ms apart to
// stay well under. Serialized through a promise chain so concurrent callers
// can't burst past the limit.
const MIN_REQUEST_GAP_MS = 150;
let lastRequestAt = 0;
let queue: Promise<unknown> = Promise.resolve();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rateLimitedFetch(url: string): Promise<Response> {
  const wait = lastRequestAt + MIN_REQUEST_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
  return fetch(url, {
    headers: {
      "User-Agent": getSecUserAgent(),
      "Accept-Encoding": "gzip, deflate",
    },
  });
}

/** Fetch a JSON resource from EDGAR with required headers and rate limiting. */
export async function fetchEdgarJson<T>(url: string): Promise<T> {
  const run = queue.then(() => rateLimitedFetch(url));
  // Keep the chain alive even when a request fails, so later calls still run.
  queue = run.catch(() => undefined);

  let response: Response;
  try {
    response = await run;
  } catch (err) {
    throw new EdgarError(
      `Network error calling EDGAR: ${err instanceof Error ? err.message : String(err)}`,
      null,
      url,
    );
  }
  if (!response.ok) {
    throw new EdgarError(
      `EDGAR returned HTTP ${response.status} for ${url}`,
      response.status,
      url,
    );
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new EdgarError(`EDGAR returned non-JSON body for ${url}`, response.status, url);
  }
}

/** Fetch a text resource (e.g. a filing document) with the same EDGAR rules. */
export async function fetchEdgarText(url: string): Promise<string> {
  const run = queue.then(() => rateLimitedFetch(url));
  queue = run.catch(() => undefined);

  let response: Response;
  try {
    response = await run;
  } catch (err) {
    throw new EdgarError(
      `Network error calling EDGAR: ${err instanceof Error ? err.message : String(err)}`,
      null,
      url,
    );
  }
  if (!response.ok) {
    throw new EdgarError(
      `EDGAR returned HTTP ${response.status} for ${url}`,
      response.status,
      url,
    );
  }
  return response.text();
}
