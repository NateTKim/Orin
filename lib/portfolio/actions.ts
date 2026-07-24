"use server";

// Server actions for the saved portfolio. Every function derives the user from
// the Clerk session on the SERVER (never from client input), and talks to
// Supabase through the Clerk-authenticated client, so Row Level Security lets
// each user touch only their own rows. These are the only write paths to
// saved_stocks; the browser never gets a direct database handle.

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server.ts";
import { resolveLatestFiling } from "@/lib/edgar/snapshot.ts";
import type {
  ActionResult,
  NewFilingMap,
  SavedStock,
  SavedStockInput,
} from "@/lib/portfolio/types.ts";

const TABLE = "saved_stocks";

// ---------------------------------------------------------------------------
// Input validation. Server actions are a public RPC surface: TypeScript types
// vanish at runtime, so a hand-crafted call can pass any shape. RLS already
// guarantees a user can only touch their OWN rows — this layer stops them
// storing junk or oversized data in those rows (e.g. a 10MB companyName).
// Helpers are not exported: a "use server" module may only export async fns.
// ---------------------------------------------------------------------------

/** Same shape accepted by the analysis endpoint: a letter, then up to 9 more
 *  letters/dots/hyphens. Returns the normalized (trimmed, upper) ticker, or
 *  null if it doesn't look like a ticker. */
const TICKER_RE = /^[A-Za-z][A-Za-z.\-]{0,9}$/;
function normalizeTicker(ticker: unknown): string | null {
  if (typeof ticker !== "string") return null;
  const t = ticker.trim().toUpperCase();
  return TICKER_RE.test(t) ? t : null;
}

/** Field length caps — generous for real filings, tight enough to block abuse. */
const MAX_COMPANY_NAME = 200;
const MAX_ACCESSION = 30;
const MAX_FORM = 10;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validate + normalize a save payload. Returns a clean row-ready object, or
 *  null if anything is the wrong type, too long, or malformed. */
function validateSaveInput(
  input: SavedStockInput,
): { ticker: string; companyName: string; accessionNumber: string; form: string; filedDate: string } | null {
  const ticker = normalizeTicker(input?.ticker);
  if (!ticker) return null;

  const { companyName, accessionNumber, form } = input;
  if (typeof companyName !== "string" || companyName.length > MAX_COMPANY_NAME) return null;
  if (typeof accessionNumber !== "string" || accessionNumber.length > MAX_ACCESSION) return null;
  if (typeof form !== "string" || form.length > MAX_FORM) return null;

  const filedDate = input.filedDate ?? "";
  if (typeof filedDate !== "string" || (filedDate !== "" && !DATE_RE.test(filedDate))) return null;

  return { ticker, companyName, accessionNumber, form, filedDate };
}

/** Add (or refresh) a company in the signed-in user's portfolio. */
export async function saveStock(input: SavedStockInput): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "not-signed-in" };

  const clean = validateSaveInput(input);
  if (!clean) return { ok: false, error: "invalid-input" };

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from(TABLE).upsert(
    {
      user_id: userId,
      ticker: clean.ticker,
      company_name: clean.companyName,
      accession_number: clean.accessionNumber,
      form: clean.form,
      filed_date: clean.filedDate || null,
    },
    { onConflict: "user_id,ticker" },
  );
  if (error) {
    console.error(`[portfolio] save error: ${error.message}`);
    return { ok: false, error: error.message };
  }
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Remove a company from the signed-in user's portfolio. */
export async function removeStock(ticker: string): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "not-signed-in" };

  const clean = normalizeTicker(ticker);
  if (!clean) return { ok: false, error: "invalid-input" };

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from(TABLE).delete().eq("user_id", userId).eq("ticker", clean);
  if (error) {
    console.error(`[portfolio] remove error: ${error.message}`);
    return { ok: false, error: error.message };
  }
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Is this ticker already in the signed-in user's portfolio? */
export async function isStockSaved(ticker: string): Promise<boolean> {
  const { userId } = await auth();
  if (!userId) return false;

  const clean = normalizeTicker(ticker);
  if (!clean) return false;

  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from(TABLE)
    .select("ticker")
    .eq("user_id", userId)
    .eq("ticker", clean)
    .maybeSingle();
  return Boolean(data);
}

/**
 * Lazily check whether any saved company has a filing newer than the one the
 * user saved. EDGAR-ONLY: each check is a lightweight `resolveLatestFiling`
 * (ticker map is cached in-memory; one submissions JSON per company), all
 * rate-limited inside the EDGAR client. NO company facts, NO filing text, NO
 * Claude — so this never triggers the expensive analysis path. Called from the
 * client after first paint so it never blocks the dashboard render, and it
 * degrades to "no badge" on any failure.
 *
 * `saved` carries each company's ticker + the accession number recorded when it
 * was saved; we flag a newer filing when EDGAR's current latest differs.
 */
export async function checkForNewFilings(
  saved: Array<{ ticker: string; accessionNumber: string }>,
): Promise<NewFilingMap> {
  const { userId } = await auth();
  if (!userId) return {};

  const entries = await Promise.all(
    saved.map(async ({ ticker, accessionNumber }) => {
      // Without a saved accession we have nothing to compare against.
      if (!accessionNumber) return [ticker, false] as const;
      try {
        const resolved = await resolveLatestFiling(ticker);
        if (!resolved.ok) return [ticker, false] as const;
        return [ticker, resolved.filing.accessionNumber !== accessionNumber] as const;
      } catch {
        return [ticker, false] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

/**
 * The signed-in user's saved companies, newest first.
 * Returns `null` to signal a real load failure (Supabase error), which the
 * dashboard shows as a distinct "couldn't load" state — as opposed to `[]`,
 * which genuinely means the portfolio is empty. Logged-out callers get `[]`.
 */
export async function getSavedStocks(): Promise<SavedStock[] | null> {
  const { userId } = await auth();
  if (!userId) return [];

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select("ticker, company_name, accession_number, form, filed_date, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error(`[portfolio] list error: ${error.message}`);
    return null;
  }
  return (data ?? []).map((r) => ({
    ticker: r.ticker,
    companyName: r.company_name ?? r.ticker,
    accessionNumber: r.accession_number ?? "",
    form: r.form ?? "",
    filedDate: r.filed_date ?? "",
    savedAt: r.created_at,
  }));
}
