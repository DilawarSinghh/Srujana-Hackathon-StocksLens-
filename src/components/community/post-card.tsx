import Link from "next/link";
import Image from "next/image";
import { Repeat2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { FeedPost } from "@/lib/community/queries";
import { relativeTime, absoluteTime } from "@/lib/community/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { PostBody } from "@/components/community/post-body";
import { AttachedStockCard } from "@/components/community/attached-stock-card";
import { PostActions } from "@/components/community/post-actions";
import { PollCard } from "@/components/community/poll-card";
import { PortfolioShareCard } from "@/components/community/portfolio-share-card";
import { PostMenu } from "@/components/community/post-menu";

const TYPE_LABEL: Record<FeedPost["postType"], string | null> = {
  discussion: null,
  thesis: "Thesis",
  analysis: "Analysis",
  portfolio_review: "Portfolio review",
  poll: "Poll",
};

const STANCE: Record<string, { label: string; className: string; Icon: typeof TrendingUp }> = {
  bullish: { label: "Bullish", className: "text-strong border-strong/30 bg-strong/10", Icon: TrendingUp },
  bearish: { label: "Bearish", className: "text-weak border-weak/30 bg-weak/10", Icon: TrendingDown },
  neutral: { label: "Neutral", className: "text-muted-foreground border-border bg-muted", Icon: Minus },
};

/**
 * One feed item. Server-rendered; the interaction bar and poll are client
 * components. Reposts show attribution and embed the original (one level).
 */
export function PostCard({
  post,
  signedIn,
  viewerId,
}: {
  post: FeedPost;
  signedIn: boolean;
  viewerId: string | null;
}) {
  // A pure repost (empty body) renders the original with a "reposted" header.
  if (post.repostOf && post.body.trim() === "") {
    return (
      <article className="border-b border-border px-4 py-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Repeat2 className="h-3.5 w-3.5" aria-hidden="true" />
          <Link href={`/community/profile/${post.authorId}`} className="hover:underline">
            {post.authorName}
          </Link>{" "}
          reposted
        </p>
        <InnerPost post={post.repostOf} signedIn={signedIn} viewerId={viewerId} />
      </article>
    );
  }

  return (
    <article className="border-b border-border px-4 py-3">
      <InnerPost post={post} signedIn={signedIn} viewerId={viewerId} />
    </article>
  );
}

function InnerPost({
  post,
  signedIn,
  viewerId,
}: {
  post: FeedPost;
  signedIn: boolean;
  viewerId: string | null;
}) {
  const typeLabel = TYPE_LABEL[post.postType];
  const stance = post.stance ? STANCE[post.stance] : null;

  return (
    <div className="flex gap-3">
      <Link href={`/community/profile/${post.authorId}`} className="shrink-0" aria-label={`${post.authorName} profile`}>
        {post.authorAvatar ? (
          <Image src={post.authorAvatar} alt="" width={40} height={40} className="rounded-full" />
        ) : (
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-medium">
            {post.authorName.charAt(0).toUpperCase()}
          </span>
        )}
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/community/profile/${post.authorId}`} className="truncate font-semibold hover:underline">
            {post.authorName}
          </Link>
          <span className="text-muted-foreground" title={absoluteTime(post.createdAt)}>
            · {relativeTime(post.createdAt)}
            {post.editedAt ? " · edited" : ""}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            {typeLabel ? (
              <Badge variant="outline" className="text-[10px]">
                {typeLabel}
              </Badge>
            ) : null}
            <PostMenu postId={post.id} authorId={post.authorId} viewerId={viewerId} signedIn={signedIn} />
          </div>
        </div>

        {stance ? (
          <span
            className={cn(
              "mt-1 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
              stance.className,
            )}
          >
            <stance.Icon className="h-3 w-3" aria-hidden="true" />
            {stance.label}
          </span>
        ) : null}

        <div className="mt-1">
          <Link href={`/community/post/${post.id}`} className="block">
            <PostBody text={post.body} />
          </Link>
        </div>

        {post.thesisRisks ? (
          <p className="mt-2 rounded-md border border-average/30 bg-average/10 px-2 py-1 text-xs">
            <span className="font-medium">Invalidated if:</span> {post.thesisRisks}
          </p>
        ) : null}
        {post.timeHorizon ? (
          <p className="mt-1 text-xs text-muted-foreground">Horizon: {post.timeHorizon}</p>
        ) : null}

        {post.stocks.length > 0 ? (
          <div className="mt-2 flex flex-col gap-2">
            {post.stocks.map((s) => (
              <AttachedStockCard key={s.symbol} symbol={s.symbol} snapshot={s.snapshot} />
            ))}
          </div>
        ) : null}

        {post.poll ? <PollCard poll={post.poll} signedIn={signedIn} /> : null}

        {post.portfolioShareId ? (
          <PortfolioShareCard share={post.portfolioShare} shareId={post.portfolioShareId} />
        ) : null}

        <PostActions
          postId={post.id}
          likeCount={post.likeCount}
          commentCount={post.commentCount}
          repostCount={post.repostCount}
          viewerLiked={post.viewerLiked}
          viewerReposted={post.viewerReposted}
          viewerBookmarked={post.viewerBookmarked}
          signedIn={signedIn}
        />
      </div>
    </div>
  );
}
