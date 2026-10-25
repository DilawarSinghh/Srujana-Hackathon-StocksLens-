import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPostsByStock } from "@/lib/community/queries";
import { StockFollowButton } from "@/components/community/stock-follow-button";
import { PostCard } from "@/components/community/post-card";

export const dynamic = "force-dynamic";

export default async function StockDiscussionPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol: raw } = await params;
  const symbol = decodeURIComponent(raw).toUpperCase();
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data: stock } = await supabase
    .from("stocks")
    .select("id, symbol, name, sector, exchange")
    .eq("symbol", symbol)
    .maybeSingle();
  if (!stock) notFound();

  let following = false;
  if (user) {
    const { data } = await supabase
      .from("community_stock_follows")
      .select("stock_id")
      .eq("user_id", user.id)
      .eq("stock_id", stock.id)
      .maybeSingle();
    following = !!data;
  }

  const posts = await getPostsByStock(symbol, user?.id ?? null);

  return (
    <div className="container py-6">
      <div className="mx-auto max-w-2xl">
        <Link href="/community" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to feed
        </Link>

        <div className="rounded-xl border border-border bg-surface/40 p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold">${stock.symbol}</h1>
              <p className="text-sm text-muted-foreground">
                {stock.name}
                {stock.sector ? ` · ${stock.sector}` : ""}
              </p>
            </div>
            <StockFollowButton symbol={stock.symbol} initialFollowing={following} signedIn={!!user} />
          </div>
          <Link
            href={`/stocks/${encodeURIComponent(stock.symbol)}`}
            className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            View full StockLens analysis <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <h2 className="mb-2 mt-5 text-sm font-semibold text-muted-foreground">Discussions</h2>
        <div className="overflow-hidden rounded-xl border border-border">
          {posts.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">
              No discussions about ${stock.symbol} yet.
            </p>
          ) : (
            posts.map((p) => <PostCard key={p.id} post={p} signedIn={!!user} viewerId={user?.id ?? null} />)
          )}
        </div>
      </div>
    </div>
  );
}
