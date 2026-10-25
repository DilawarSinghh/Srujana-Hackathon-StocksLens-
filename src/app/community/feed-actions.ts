"use server";

import { getCurrentUser } from "@/lib/auth";
import { getFeed, type FeedTab, type FeedPost } from "@/lib/community/queries";

/**
 * Server action used by the client feed list to load additional pages for the
 * chronological tabs (latest / following). Ranked tabs return a single bounded
 * page, so the client won't request more for them.
 */
export async function loadMoreFeed(
  tab: FeedTab,
  cursor: string | null,
): Promise<{ posts: FeedPost[]; nextCursor: string | null }> {
  const user = await getCurrentUser();
  return getFeed({ tab, viewerId: user?.id ?? null, cursor });
}
