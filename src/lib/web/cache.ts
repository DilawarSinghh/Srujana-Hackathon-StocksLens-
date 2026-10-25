import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Server-only cache for Web Research mode, backed by the `web_cache` table
 * (RLS on, no client policies — service role only; see migration 0010).
 *
 * Search results are cached 30 minutes, page text 6 hours. Keys are sha256
 * hashes of a namespaced string so query and page caches never collide.
 */

export const SEARCH_TTL_MS = 30 * 60 * 1000; // 30 minutes
export const PAGE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

function hashKey(namespace: "search" | "page", value: string): string {
  return createHash("sha256").update(`${namespace}:${value}`).digest("hex");
}

/** Read a non-expired cache entry, or null. Best-effort (never throws). */
export async function cacheGet(
  namespace: "search" | "page",
  value: string,
): Promise<string | null> {
  const key = hashKey(namespace, value);
  try {
    const db = createAdminClient();
    const { data } = await db
      .from("web_cache")
      .select("content, expires_at")
      .eq("key", key)
      .maybeSingle();
    if (!data) return null;
    if (new Date(data.expires_at).getTime() <= Date.now()) return null;
    return data.content;
  } catch {
    return null;
  }
}

/** Upsert a cache entry with the given TTL. Best-effort (never throws). */
export async function cacheSet(
  namespace: "search" | "page",
  value: string,
  content: string,
  ttlMs: number,
): Promise<void> {
  const key = hashKey(namespace, value);
  const now = Date.now();
  try {
    const db = createAdminClient();
    await db.from("web_cache").upsert({
      key,
      content,
      fetched_at: new Date(now).toISOString(),
      expires_at: new Date(now + ttlMs).toISOString(),
    });
  } catch {
    // best-effort cache; ignore failures
  }
}
