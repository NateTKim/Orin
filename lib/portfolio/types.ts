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

export type ActionResult = { ok: true } | { ok: false; error: string };
