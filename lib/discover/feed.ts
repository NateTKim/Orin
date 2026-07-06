import "server-only";
import { createSupabaseAdminClient } from "../supabase/admin.ts";
import { buildDiscoverFeed } from "./build.ts";
import type { FeedItem } from "./types.ts";

// Cached access to the discovery feed. Reads a single shared row from Supabase
// (service-role, global for all visitors). If it's fresh, return it; otherwise
// rebuild from EDGAR and store it. Degrades gracefully: if the cache table is
// missing or Supabase is unreachable, we just build fresh every time (slower,
// but the feed still works).

const TABLE = "feed_cache";
const KEY = "discover";
const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours — plenty fresh for "recently filed"

export async function getDiscoverFeed(): Promise<FeedItem[]> {
  const cached = await readCache();
  if (cached) return cached;

  const feed = await buildDiscoverFeed();
  await writeCache(feed);
  return feed;
}

async function readCache(): Promise<FeedItem[] | null> {
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from(TABLE)
      .select("data, refreshed_at")
      .eq("id", KEY)
      .maybeSingle();
    if (error) {
      console.error(`[feed] cache read error: ${error.message}`);
      return null;
    }
    if (!data) return null;
    const ageMs = Date.now() - new Date(data.refreshed_at).getTime();
    if (ageMs > TTL_MS) return null; // stale — rebuild
    return data.data as FeedItem[];
  } catch (err) {
    console.error(`[feed] cache read threw: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function writeCache(feed: FeedItem[]): Promise<void> {
  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from(TABLE)
      .upsert({ id: KEY, data: feed, refreshed_at: new Date().toISOString() }, { onConflict: "id" });
    if (error) console.error(`[feed] cache write error: ${error.message}`);
  } catch (err) {
    console.error(`[feed] cache write threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}
