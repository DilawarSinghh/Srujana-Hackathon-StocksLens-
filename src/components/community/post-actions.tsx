"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Heart, MessageCircle, Repeat2, Bookmark } from "lucide-react";
import { toggleLike, toggleRepost, toggleBookmark } from "@/app/community/actions";
import { cn } from "@/lib/utils";

interface PostActionsProps {
  postId: string;
  likeCount: number;
  commentCount: number;
  repostCount: number;
  viewerLiked: boolean;
  viewerReposted: boolean;
  viewerBookmarked: boolean;
  signedIn: boolean;
  onComment?: () => void;
}

/**
 * Like / comment / repost / bookmark bar with optimistic UI. Failures are
 * reconciled by reverting local state and surfacing a toast; a router refresh
 * re-syncs the authoritative counts.
 */
export function PostActions({
  postId,
  likeCount,
  commentCount,
  repostCount,
  viewerLiked,
  viewerReposted,
  viewerBookmarked,
  signedIn,
  onComment,
}: PostActionsProps) {
  const router = useRouter();
  const [liked, setLiked] = React.useState(viewerLiked);
  const [likes, setLikes] = React.useState(likeCount);
  const [reposted, setReposted] = React.useState(viewerReposted);
  const [reposts, setReposts] = React.useState(repostCount);
  const [bookmarked, setBookmarked] = React.useState(viewerBookmarked);
  const [busy, setBusy] = React.useState(false);

  function requireAuth(): boolean {
    if (!signedIn) {
      toast.error("Sign in to interact with posts.");
      return false;
    }
    return true;
  }

  async function onLike() {
    if (!requireAuth() || busy) return;
    setBusy(true);
    const next = !liked;
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
    const res = await toggleLike(postId);
    setBusy(false);
    if (!res.ok) {
      setLiked(!next);
      setLikes((n) => n + (next ? -1 : 1));
      toast.error(res.error ?? "Could not update like.");
    }
  }

  async function onRepost() {
    if (!requireAuth() || busy) return;
    setBusy(true);
    const next = !reposted;
    setReposted(next);
    setReposts((n) => n + (next ? 1 : -1));
    const res = await toggleRepost(postId);
    setBusy(false);
    if (!res.ok) {
      setReposted(!next);
      setReposts((n) => n + (next ? -1 : 1));
      toast.error(res.error ?? "Could not repost.");
    } else {
      router.refresh();
    }
  }

  async function onBookmark() {
    if (!requireAuth() || busy) return;
    const next = !bookmarked;
    setBookmarked(next);
    const res = await toggleBookmark(postId);
    if (!res.ok) {
      setBookmarked(!next);
      toast.error(res.error ?? "Could not bookmark.");
    } else {
      toast.success(next ? "Bookmarked (private to you)." : "Bookmark removed.");
    }
  }

  return (
    <div className="mt-2 flex items-center gap-1 text-muted-foreground">
      <ActionButton
        label="Comment"
        onClick={() => onComment?.()}
        icon={<MessageCircle className="h-4 w-4" />}
        count={commentCount}
      />
      <ActionButton
        label={reposted ? "Undo repost" : "Repost"}
        onClick={onRepost}
        icon={<Repeat2 className="h-4 w-4" />}
        count={reposts}
        active={reposted}
        activeClass="text-strong"
      />
      <ActionButton
        label={liked ? "Unlike" : "Like"}
        onClick={onLike}
        icon={<Heart className={cn("h-4 w-4", liked && "fill-current")} />}
        count={likes}
        active={liked}
        activeClass="text-weak"
      />
      <ActionButton
        label={bookmarked ? "Remove bookmark" : "Bookmark"}
        onClick={onBookmark}
        icon={<Bookmark className={cn("h-4 w-4", bookmarked && "fill-current")} />}
        active={bookmarked}
        activeClass="text-primary"
      />
    </div>
  );
}

function ActionButton({
  label,
  icon,
  count,
  onClick,
  active,
  activeClass,
}: {
  label: string;
  icon: React.ReactNode;
  count?: number;
  onClick: () => void;
  active?: boolean;
  activeClass?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors hover:bg-accent hover:text-foreground",
        active && activeClass,
      )}
    >
      {icon}
      {count != null ? <span className="tabular-nums">{count}</span> : null}
    </button>
  );
}
