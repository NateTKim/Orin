"use server";

// Server actions for the saved portfolio. Every function derives the user from
// the Clerk session on the SERVER (never from client input), and talks to
// Supabase through the Clerk-authenticated client, so Row Level Security lets
// each user touch only their own rows. These are the only write paths to
// saved_stocks; the browser never gets a direct database handle.

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server.ts";
import type { ActionResult, SavedStock, SavedStockInput } from "@/lib/portfolio/types.ts";

const TABLE = "saved_stocks";

/** Add (or refresh) a company in the signed-in user's portfolio. */
export async function saveStock(input: SavedStockInput): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "not-signed-in" };

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from(TABLE).upsert(
    {
      user_id: userId,
      ticker: input.ticker,
      company_name: input.companyName,
      accession_number: input.accessionNumber,
      form: input.form,
      filed_date: input.filedDate || null,
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

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from(TABLE).delete().eq("user_id", userId).eq("ticker", ticker);
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

  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from(TABLE)
    .select("ticker")
    .eq("user_id", userId)
    .eq("ticker", ticker)
    .maybeSingle();
  return Boolean(data);
}

/** The signed-in user's saved companies, newest first. */
export async function getSavedStocks(): Promise<SavedStock[]> {
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
    return [];
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
