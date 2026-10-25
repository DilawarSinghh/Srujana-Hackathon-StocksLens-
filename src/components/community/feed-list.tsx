"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import type { FeedPost, FeedTab } from "@/lib/community/queries";
import { loadMoreFeed } from "@/app/community/feed-actions";
import { PostCard } from "@/components/community/post-card";
import { Button } from "@/components/ui/button";

/**
 * Client feed list. Receives the first server-rendered page and loads more via
 * a server action (cursor pagination) for the chronological tabs. Handles
 * empty, loading, error, and retry states.
 */
export function FeedList({
  tab,
  initialPosts,
  initialCursor,
  signedIn,
  viewerId,
  emptyMessage,
}: {
  tab: FeedTab;
  initialPosts: FeedPost[];
  initialCursor: string | null;
  signedIn: boolean;
  viewerId: string | null;
  emptyMessage: string;
}) {
  const [posts, setPosts] = React.useState(initialPosts);
  const [cursor, setCursor] = React.useState(initialCursor);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(false);

  // Reset when the tab changes (new initial props).
  React.useEffect(() => {
    setPosts(initialPosts);
    setCursor(initialCursor);
    setError(false);
  }, [initialPosts, initialCursor]);

  async function loadMore() {
    if (loading || !cursor) return;
    setLoading(true);
    setError(false);
    try {
      const res = await loadMoreFeed(tab, cursor);
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...res.posts.filter((p) => !seen.has(p.id))];
      });
      setCursor(res.nextCursor);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  if (posts.length === 0) {
    return (
      <div className="px-4 py-12 text-center text-sm text-muted-foreground">{emptyMessage}</div>
    );
  }

  return (
    <div>
      {posts.map((p) => (
        <PostCard key={p.id} post={p} signedIn={signedIn} viewerId={viewerId} />
      ))}

      {cursor ? (
        <div className="flex justify-center py-4">
          {error ? (
            <Button variant="outline" size="sm" onClick={loadMore}>
              Retry
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={loadMore} disabled={loading} className="gap-1.5">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {loading ? "Loading…" : "Load more"}
            </Button>
          )}
        </div>
      ) : (
        <p className="py-4 text-center text-xs text-muted-foreground">You&apos;re all caught up.</p>
      )}
    </div>
  );
}
