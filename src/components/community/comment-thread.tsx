"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Heart, Loader2 } from "lucide-react";
import type { CommentNode } from "@/lib/community/queries";
import {
  createComment,
  toggleCommentLike,
  editComment,
  deleteComment,
} from "@/app/community/actions";
import { COMMENT_BODY_MAX } from "@/lib/community/schemas";
import { relativeTime } from "@/lib/community/format";
import { PostBody } from "@/components/community/post-body";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The full comment thread: a composer plus a 2-level tree. */
export function CommentThread({
  postId,
  comments,
  signedIn,
  viewerId,
}: {
  postId: string;
  comments: CommentNode[];
  signedIn: boolean;
  viewerId: string | null;
}) {
  return (
    <div className="px-4 py-3">
      <h2 className="mb-2 text-sm font-semibold">
        {comments.reduce((n, c) => n + 1 + c.replies.length, 0)} comments
      </h2>
      {signedIn ? (
        <CommentComposer postId={postId} />
      ) : (
        <p className="mb-3 text-sm text-muted-foreground">
          <Link href={`/login?next=/community/post/${postId}`} className="text-primary hover:underline">
            Sign in
          </Link>{" "}
          to join the discussion.
        </p>
      )}
      <ul className="mt-3 flex flex-col gap-3">
        {comments.map((c) => (
          <li key={c.id}>
            <CommentItem comment={c} postId={postId} signedIn={signedIn} viewerId={viewerId} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function CommentComposer({ postId, parentId, onDone }: { postId: string; parentId?: string; onDone?: () => void }) {
  const router = useRouter();
  const [body, setBody] = React.useState("");
  const [pending, setPending] = React.useState(false);

  async function submit() {
    if (pending || body.trim().length === 0) return;
    setPending(true);
    const res = await createComment({ postId, body: body.trim(), parentId });
    setPending(false);
    if (res.ok) {
      setBody("");
      onDone?.();
      router.refresh();
    } else toast.error(res.error ?? "Could not comment.");
  }

  return (
    <div className="flex flex-col gap-1.5">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={parentId ? "Write a reply…" : "Add a comment…"}
        maxLength={COMMENT_BODY_MAX}
        rows={2}
        className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        aria-label="Comment text"
      />
      <div className="flex items-center justify-end gap-2">
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {body.length}/{COMMENT_BODY_MAX}
        </span>
        <Button size="sm" onClick={submit} disabled={pending || body.trim().length === 0} className="gap-1">
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {parentId ? "Reply" : "Comment"}
        </Button>
      </div>
    </div>
  );
}

function CommentItem({
  comment,
  postId,
  signedIn,
  viewerId,
}: {
  comment: CommentNode;
  postId: string;
  signedIn: boolean;
  viewerId: string | null;
}) {
  const router = useRouter();
  const isAuthor = viewerId === comment.authorId;
  const [liked, setLiked] = React.useState(comment.viewerLiked);
  const [likes, setLikes] = React.useState(comment.likeCount);
  const [replying, setReplying] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(comment.body);

  async function onLike() {
    if (!signedIn) {
      toast.error("Sign in to like comments.");
      return;
    }
    const next = !liked;
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
    const res = await toggleCommentLike(comment.id);
    if (!res.ok) {
      setLiked(!next);
      setLikes((n) => n + (next ? -1 : 1));
      toast.error(res.error ?? "Could not like.");
    }
  }

  async function saveEdit() {
    const res = await editComment({ commentId: comment.id, body: draft.trim() });
    if (res.ok) {
      setEditing(false);
      router.refresh();
    } else toast.error(res.error ?? "Could not edit.");
  }

  async function onDelete() {
    if (!confirm("Delete this comment?")) return;
    const res = await deleteComment(comment.id);
    if (res.ok) router.refresh();
    else toast.error(res.error ?? "Could not delete.");
  }

  return (
    <div className="flex gap-2">
      <Link href={`/community/profile/${comment.authorId}`} className="shrink-0">
        {comment.authorAvatar ? (
          <Image src={comment.authorAvatar} alt="" width={32} height={32} className="rounded-full" />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
            {comment.authorName.charAt(0).toUpperCase()}
          </span>
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <div className="rounded-lg bg-muted/40 px-3 py-2">
          <div className="flex items-center gap-2 text-xs">
            <Link href={`/community/profile/${comment.authorId}`} className="font-semibold hover:underline">
              {comment.authorName}
            </Link>
            <span className="text-muted-foreground">
              · {relativeTime(comment.createdAt)}
              {comment.editedAt ? " · edited" : ""}
            </span>
          </div>
          {editing ? (
            <div className="mt-1 flex flex-col gap-1.5">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={COMMENT_BODY_MAX}
                rows={2}
                className="w-full resize-y rounded-md border border-input bg-background px-2 py-1 text-sm"
                aria-label="Edit comment"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={saveEdit} disabled={draft.trim().length === 0}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-0.5">
              <PostBody text={comment.body} />
            </div>
          )}
        </div>

        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
          <button type="button" onClick={onLike} className={cn("flex items-center gap-1 hover:text-foreground", liked && "text-weak")}>
            <Heart className={cn("h-3.5 w-3.5", liked && "fill-current")} />
            {likes > 0 ? likes : null}
          </button>
          {signedIn && comment.replies.length === 0 ? (
            <button type="button" onClick={() => setReplying((r) => !r)} className="hover:text-foreground">
              Reply
            </button>
          ) : null}
          {isAuthor ? (
            <>
              <button type="button" onClick={() => setEditing((e) => !e)} className="hover:text-foreground">
                Edit
              </button>
              <button type="button" onClick={onDelete} className="hover:text-destructive">
                Delete
              </button>
            </>
          ) : null}
        </div>

        {replying ? (
          <div className="mt-2">
            <CommentComposer postId={postId} parentId={comment.id} onDone={() => setReplying(false)} />
          </div>
        ) : null}

        {comment.replies.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-2 border-l border-border pl-3">
            {comment.replies.map((r) => (
              <li key={r.id}>
                <CommentItem comment={r} postId={postId} signedIn={signedIn} viewerId={viewerId} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
