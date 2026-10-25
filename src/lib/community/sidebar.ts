import "server-only";
import { createClient } from "@/lib/supabase/server";
import { TRENDING_WINDOW_HOURS } from "@/lib/community/ranking";

/** Top hashtags and most-discussed stocks over the trending window. */
export async function getSidebarData(): Promise<{
  tags: { tag: string; count: number }[];
  stocks: { symbol: string; count: number }[];
}> {
  const supabase = await createClient();
  const since = new Date(Date.now() - TRENDING_WINDOW_HOURS * 3_600_000).toISOString();

  const { data: posts } = await supabase
    .from("community_posts")
    .select("id, hashtags")
    .is("deleted_at", null)
    .gte("created_at", since)
    .limit(500);

  const tagCount = new Map<string, number>();
  const ids: string[] = [];
  for (const p of posts ?? []) {
    ids.push(p.id);
    for (const t of p.hashtags ?? []) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
  }

  const stockCount = new Map<string, number>();
  if (ids.length > 0) {
    const { data: ps } = await supabase
      .from("community_post_stocks")
      .select("post_id, stocks(symbol)")
      .in("post_id", ids);
    for (const row of ps ?? []) {
      const sym = (row as unknown as { stocks: { symbol: string } | null }).stocks?.symbol;
      if (sym) stockCount.set(sym, (stockCount.get(sym) ?? 0) + 1);
    }
  }

  const tags = [...tagCount.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
  const stocks = [...stockCount.entries()]
    .map(([symbol, count]) => ({ symbol, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  return { tags, stocks };
}
