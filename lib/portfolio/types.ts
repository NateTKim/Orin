// Shared portfolio types. Kept out of the "use server" actions file because a
// server-actions module may only export async functions.

/** Fields captured when a user saves a company (from the results snapshot). */
export interface SavedStockInput {
  ticker: string;
  companyName: string;
  accessionNumber: string;
  form: string;
  /** Filing date, YYYY-MM-DD. */
  filedDate: string;
}

/** A saved company as read back for the dashboard. */
export interface SavedStock extends SavedStockInput {
  /** When the user saved it (ISO timestamp). */
  savedAt: string;
}

/**
 * A saved company enriched for the dashboard. `health` is computed from the
 * CACHED analysis of the saved filing when one exists (cheap — no EDGAR, no
 * Claude); it's `null` when this filing hasn't been analyzed yet, in which case
 * the card invites the user to open it. `hasNewerFiling` is filled in lazily on
 * the client (see checkForNewFilings) and starts undefined ("not checked yet").
 */
export interface SavedStockWithHealth extends SavedStock {
  health: import("@/lib/health/score.ts").HealthResult | null;
  hasNewerFiling?: boolean;
}

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Result of the lazy "is there a newer filing?" check, keyed by ticker. */
export type NewFilingMap = Record<string, boolean>;
