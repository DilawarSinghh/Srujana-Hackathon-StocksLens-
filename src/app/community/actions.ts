"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import {
  createPostSchema,
  createCommentSchema,
  editCommentSchema,
  reportSchema,
  createShareSchema,
  createReviewSchema,
  type CreateShareInput,
} from "@/lib/community/schemas";
import { extractHashtags, extractCashtags, extractMentions } from "@/lib/community/text";
import { resolveSymbols, buildStockSnapshots } from "@/lib/community/stock-card";
import { notify } from "@/lib/community/notify";
import { buildShareRiskSnapshot } from "@/lib/community/share-risk";
import type { ShareRiskSnapshot } from "@/types/database";

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
}

/** Simple abuse control: max new posts per rolling hour. */
const POST_RATE_LIMIT = 20;
const COMMENT_RATE_LIMIT = 60;

async function tooManyRecent(
  table: "community_posts" | "community_comments",
  userId: string,
  limit: number,
): Promise<boolean> {
  const supabase = await createClient();
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("author_id", userId)
    .gte("created_at", since);
  return (count ?? 0) >= limit;
}

/**
 * Whether the current user is a community moderator. Uses the same SECURITY
 * DEFINER DB function the RLS policies use, so the answer here matches what the
 * database will actually permit. Fails closed (false) on any error.
 */
async function isCommunityModerator(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_community_moderator");
  if (error) return false;
  return data === true;
}

/** Resolve @handles to recipient user ids for mention notifications. */
async function resolveMentionRecipients(handles: string[]): Promise<string[]> {
  if (handles.length === 0) return [];
  const supabase = await createClient();
  // Handles match the start of a profile's full_name (best-effort; the app has
  // no separate username column). Cap the lookup.
  const ids: string[] = [];
  for (const h of handles.slice(0, 5)) {
    const { data } = await supabase
      .from("profiles")
      .select("id")
      .ilike("full_name", `${h.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)
      .limit(1)
      .maybeSingle();
    if (data) ids.push(data.id);
  }
  return [...new Set(ids)];
}

/** Create a post. Validates tickers against the universe and stores snapshots. */
export async function createPost(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in." };

  const parsed = createPostSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid post." };
  }
  if (await tooManyRecent("community_posts", user.id, POST_RATE_LIMIT)) {
    return { ok: false, error: "You're posting too fast. Try again in a bit." };
  }

  const v = parsed.data;
  const supabase = await createClient();

  // Merge explicit symbols with $cashtags found in the body, validate all.
  const candidates = [...v.symbols, ...extractCashtags(v.body)];
  const { valid, idBySymbol } = await resolveSymbols(candidates);
  if ((v.postType === "analysis" || v.postType === "thesis") && valid.length === 0) {
    return { ok: false, error: "None of the tickers match a stock in StockLens." };
  }

  // portfolio_review must link a share the user owns.
  if (v.postType === "portfolio_review" && v.portfolioShareId) {
    const { data: share } = await supabase
      .from("community_portfolio_shares")
      .select("id, owner_id")
      .eq("id", v.portfolioShareId)
      .maybeSingle();
    if (!share || share.owner_id !== user.id) {
      return { ok: false, error: "You can only attach your own portfolio share." };
    }
  }

  const { data: post, error } = await supabase
    .from("community_posts")
    .insert({
      author_id: user.id,
      post_type: v.postType,
      body: v.body,
      stance: v.postType === "thesis" ? v.stance ?? null : null,
      time_horizon: v.postType === "thesis" ? v.timeHorizon ?? null : null,
      thesis_risks: v.postType === "thesis" ? v.thesisRisks ?? null : null,
      portfolio_share_id: v.postType === "portfolio_review" ? v.portfolioShareId ?? null : null,
      hashtags: extractHashtags(v.body),
    })
    .select("id")
    .single();
  if (error || !post) return { ok: false, error: "Could not publish the post." };

  // Attach validated tickers with point-in-time snapshots.
  if (valid.length > 0) {
    const snaps = await buildStockSnapshots(valid);
    const rows = valid.map((sym) => ({
      post_id: post.id,
      stock_id: idBySymbol.get(sym)!,
      snapshot: snaps.get(sym)?.snapshot ?? null,
    }));
    await supabase.from("community_post_stocks").insert(rows);
  }

  // Poll.
  if (v.postType === "poll" && v.pollQuestion && v.pollOptions && v.pollClosesAt) {
    const { data: poll } = await supabase
      .from("community_polls")
      .insert({ post_id: post.id, question: v.pollQuestion, closes_at: v.pollClosesAt })
      .select("id")
      .single();
    if (poll) {
      const opts = v.pollOptions
        .filter((o) => o.trim().length > 0)
        .map((label, i) => ({ poll_id: poll.id, label, position: i }));
      await supabase.from("community_poll_options").insert(opts);
    }
  }

  // Mention notifications (best-effort).
  const recipients = await resolveMentionRecipients(extractMentions(v.body));
  for (const r of recipients) {
    await notify({ recipientId: r, actorId: user.id, type: "mention", postId: post.id });
  }

  revalidatePath("/community");
  return { ok: true, data: { id: post.id } };
}

/** Soft-delete a post (author, or a moderator). */
export async function deletePost(postId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in." };
  const supabase = await createClient();

  const isModerator = await isCommunityModerator(supabase);

  if (isModerator) {
    // Moderators soft-delete via a least-privilege SECURITY DEFINER RPC that
    // mutates only `deleted_at` and re-checks moderator status server-side. A
    // direct UPDATE would be blocked by the author-only "posts update own" RLS
    // policy (which we intentionally leave unchanged).
    const { data: deleted, error } = await supabase.rpc(
      "moderator_soft_delete_post",
      { target_post_id: postId },
    );
    if (error) return { ok: false, error: "Could not delete the post." };
    if (!deleted) return { ok: false, error: "Post not found." };
    revalidatePath("/community");
    return { ok: true };
  }

  // Ordinary authors: author-scoped soft-delete (defense in depth on top of
  // the "posts update own" RLS policy).
  const { error } = await supabase
    .from("community_posts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", postId)
    .eq("author_id", user.id);
  if (error) return { ok: false, error: "Could not delete the post." };
  revalidatePath("/community");
  return { ok: true };
}

/** Toggle a like on a post. Idempotent per (user, post) via PK. */
export async function toggleLike(postId: string): Promise<ActionResult<{ liked: boolean }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in." };
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("community_post_likes")
    .select("post_id")
    .eq("post_id", postId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    await supabase.from("community_post_likes").delete().eq("post_id", postId).eq("user_id", user.id);
    revalidatePath(`/community/post/${postId}`);
    return { ok: true, data: { liked: false } };
  }
  const { error } = await supabase
    .from("community_post_likes")
    .insert({ post_id: postId, user_id: user.id });
  // A duplicate (race) conflicts on the PK; treat as already-liked.
  if (error && !error.message.includes("duplicate")) {
    return { ok: false, error: "Could not like the post." };
  }
  // Notify the author.
  const { data: post } = await supabase.from("community_posts").select("author_id").eq("id", postId).maybeSingle();
  if (post) await notify({ recipientId: post.author_id, actorId: user.id, type: "like", postId });
  revalidatePath(`/community/post/${postId}`);
  return { ok: true, data: { liked: true } };
}

/** Toggle a comment like. */
export async function toggleCommentLike(commentId: string): Promise<ActionResult<{ liked: boolean }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in." };
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("community_comment_likes")
    .select("comment_id")
    .eq("comment_id", commentId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) {
    await supabase.from("community_comment_likes").delete().eq("comment_id", commentId).eq("user_id", user.id);
    return { ok: true, data: { liked: false } };
  }
  const { error } = await supabase.from("community_comment_likes").insert({ comment_id: commentId, user_id: user.id });
  if (error && !error.message.includes("duplicate")) return { ok: false, error: "Could not like the comment." };
  return { ok: true, data: { liked: true } };
}

/** Toggle a bookmark (private). */
export async function toggleBookmark(postId: string): Promise<ActionResult<{ bookmarked: boolean }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in." };
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("community_bookmarks")
    .select("post_id")
    .eq("post_id", postId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) {
    await supabase.from("community_bookmarks").delete().eq("post_id", postId).eq("user_id", user.id);
    return { ok: true, data: { bookmarked: false } };
  }
  const { error } = await supabase.from("community_bookmarks").insert({ post_id: postId, user_id: user.id });
  if (error && !error.message.includes("duplicate")) return { ok: false, error: "Could not bookmark the post." };
  return { ok: true, data: { bookmarked: true } };
}

/** Toggle a repost of the original post. Idempotent via the partial unique index. */
export async function toggleRepost(postId: string): Promise<ActionResult<{ reposted: boolean }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in." };
  const supabase = await createClient();

  // The target must be an original (not itself a repost).
  const { data: target } = await supabase
    .from("community_posts")
    .select("id, author_id, repost_of")
    .eq("id", postId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!target) return { ok: false, error: "Post not found." };
  const originalId = target.repost_of ?? target.id;

  const { data: existing } = await supabase
    .from("community_posts")
    .select("id")
    .eq("author_id", user.id)
    .eq("repost_of", originalId)
    .maybeSingle();
  if (existing) {
    await supabase.from("community_posts").delete().eq("id", existing.id);
    revalidatePath("/community");
    return { ok: true, data: { reposted: false } };
  }
  const { error } = await supabase
    .from("community_posts")
    .insert({ author_id: user.id, post_type: "discussion", body: "", repost_of: originalId });
  if (error) return { ok: false, error: "Could not repost." };
  const { data: orig } = await supabase.from("community_posts").select("author_id").eq("id", originalId).maybeSingle();
  if (orig) await notify({ recipientId: orig.author_id, actorId: user.id, type: "repost", postId: originalId });
  revalidatePath("/community");
  return { ok: true, data: { reposted: true } };
}

/** Follow / unfollow a user. */
export async function toggleFollow(followeeId: string): Promise<ActionResult<{ following: boolean }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in." };
  if (user.id === followeeId) return { ok: false, error: "You can't follow yourself." };
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("community_follows")
    .select("followee_id")
    .eq("follower_id", user.id)
    .eq("followee_id", followeeId)
    .maybeSingle();
  if (existing) {
    await supabase.from("community_follows").delete().eq("follower_id", user.id).eq("followee_id", followeeId);
    revalidatePath(`/community/profile/${followeeId}`);
    return { ok: true, data: { following: false } };
  }
  const { error } = await supabase.from("community_follows").insert({ follower_id: user.id, followee_id: followeeId });
  if (error && !error.message.includes("duplicate")) return { ok: false, error: "Could not follow." };
  await notify({ recipientId: followeeId, actorId: user.id, type: "follow" });
  revalidatePath(`/community/profile/${followeeId}`);
  return { ok: true, data: { following: true } };
}

/** Follow / unfollow a stock by symbol. */
export async function toggleStockFollow(symbol: string): Promise<ActionResult<{ following: boolean }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in." };
  const supabase = await createClient();
  const { data: stock } = await supabase
    .from("stocks")
    .select("id")
    .eq("symbol", symbol.toUpperCase())
    .maybeSingle();
  if (!stock) return { ok: false, error: "Unknown stock symbol." };
  const { data: existing } = await supabase
    .from("community_stock_follows")
    .select("stock_id")
    .eq("user_id", user.id)
    .eq("stock_id", stock.id)
    .maybeSingle();
  if (existing) {
    await supabase.from("community_stock_follows").delete().eq("user_id", user.id).eq("stock_id", stock.id);
    revalidatePath(`/community/stock/${symbol.toUpperCase()}`);
    return { ok: true, data: { following: false } };
  }
  const { error } = await supabase.from("community_stock_follows").insert({ user_id: user.id, stock_id: stock.id });
  if (error && !error.message.includes("duplicate")) return { ok: false, error: "Could not follow the stock." };
  revalidatePath(`/community/stock/${symbol.toUpperCase()}`);
  return { ok: true, data: { following: true } };
}

/** Create a comment or reply. Nesting capped at depth 1. */
export async function createComment(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in." };
  const parsed = createCommentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a valid comment." };
  if (await tooManyRecent("community_comments", user.id, COMMENT_RATE_LIMIT)) {
    return { ok: false, error: "You're commenting too fast. Try again shortly." };
  }
  const supabase = await createClient();
  const { postId, body, parentId } = parsed.data;

  let depth = 0;
  let notifyUserId: string | null = null;
  if (parentId) {
    const { data: parent } = await supabase
      .from("community_comments")
      .select("depth, author_id, post_id")
      .eq("id", parentId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!parent || parent.post_id !== postId) return { ok: false, error: "Invalid parent comment." };
    // Cap nesting: a reply to a reply attaches to the same top-level comment.
    depth = 1;
    notifyUserId = parent.author_id;
  }

  const { data: comment, error } = await supabase
    .from("community_comments")
    .insert({ post_id: postId, author_id: user.id, parent_id: parentId ?? null, body, depth })
    .select("id")
    .single();
  if (error || !comment) return { ok: false, error: "Could not post the comment." };

  // Notify the post author (and the parent comment author for replies).
  const { data: post } = await supabase.from("community_posts").select("author_id").eq("id", postId).maybeSingle();
  if (post) await notify({ recipientId: post.author_id, actorId: user.id, type: "reply", postId, commentId: comment.id });
  if (notifyUserId) await notify({ recipientId: notifyUserId, actorId: user.id, type: "reply", postId, commentId: comment.id });

  revalidatePath(`/community/post/${postId}`);
  return { ok: true, data: { id: comment.id } };
}

/** Edit a comment (author only, enforced by RLS + check here). */
export async function editComment(input: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in." };
  const parsed = editCommentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a valid comment." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("community_comments")
    .update({ body: parsed.data.body, edited_at: new Date().toISOString() })
    .eq("id", parsed.data.commentId)
    .eq("author_id", user.id); // defense in depth; RLS also enforces this
  if (error) return { ok: false, error: "Could not edit the comment." };
  return { ok: true };
}

/** Soft-delete a comment (author or moderator via RLS). */
export async function deleteComment(commentId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in." };
  const supabase = await createClient();

  const isModerator = await isCommunityModerator(supabase);

  if (isModerator) {
    // Moderators soft-delete via a least-privilege SECURITY DEFINER RPC that
    // mutates only `deleted_at` and re-checks moderator status server-side. A
    // direct UPDATE would be blocked by the author-only "comments update own"
    // RLS policy (which we intentionally leave unchanged).
    const { data: deleted, error } = await supabase.rpc(
      "moderator_soft_delete_comment",
      { target_comment_id: commentId },
    );
    if (error) return { ok: false, error: "Could not delete the comment." };
    if (!deleted) return { ok: false, error: "Comment not found." };
    return { ok: true };
  }

  // Ordinary authors: author-scoped soft-delete (defense in depth on top of
  // the "comments update own" RLS policy).
  const { error } = await supabase
    .from("community_comments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", commentId)
    .eq("author_id", user.id);
  if (error) return { ok: false, error: "Could not delete the comment." };
  return { ok: true };
}

/** Vote on a poll. One vote per user; the DB PK prevents duplicates. */
export async function votePoll(pollId: string, optionId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in." };
  const supabase = await createClient();
  const { data: poll } = await supabase
    .from("community_polls")
    .select("id, closes_at, post_id")
    .eq("id", pollId)
    .maybeSingle();
  if (!poll) return { ok: false, error: "Poll not found." };
  if (new Date(poll.closes_at).getTime() <= Date.now()) {
    return { ok: false, error: "This poll has closed." };
  }
  // The option must belong to this poll.
  const { data: opt } = await supabase
    .from("community_poll_options")
    .select("id")
    .eq("id", optionId)
    .eq("poll_id", pollId)
    .maybeSingle();
  if (!opt) return { ok: false, error: "Invalid option." };

  const { error } = await supabase
    .from("community_poll_votes")
    .insert({ poll_id: pollId, option_id: optionId, user_id: user.id });
  if (error) {
    if (error.message.includes("duplicate")) return { ok: false, error: "You've already voted." };
    return { ok: false, error: "Could not record your vote." };
  }
  revalidatePath(`/community/post/${poll.post_id}`);
  return { ok: true };
}

/** Report a post / comment / profile. */
export async function reportContent(input: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in." };
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a reason." };
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("community_reports").insert({
    reporter_id: user.id,
    target_type: v.targetType,
    post_id: v.postId ?? null,
    comment_id: v.commentId ?? null,
    target_user_id: v.targetUserId ?? null,
    reason: v.reason,
  });
  if (error) return { ok: false, error: "Could not submit the report." };
  return { ok: true };
}

/** Block / unblock a user. */
export async function toggleBlock(blockedId: string): Promise<ActionResult<{ blocked: boolean }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in." };
  if (user.id === blockedId) return { ok: false, error: "You can't block yourself." };
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("community_blocks")
    .select("blocked_id")
    .eq("blocker_id", user.id)
    .eq("blocked_id", blockedId)
    .maybeSingle();
  if (existing) {
    await supabase.from("community_blocks").delete().eq("blocker_id", user.id).eq("blocked_id", blockedId);
    return { ok: true, data: { blocked: false } };
  }
  const { error } = await supabase.from("community_blocks").insert({ blocker_id: user.id, blocked_id: blockedId });
  if (error && !error.message.includes("duplicate")) return { ok: false, error: "Could not block the user." };
  return { ok: true, data: { blocked: true } };
}

/**
 * Create a revocable portfolio SHARE: a self-contained snapshot. We read the
 * user's real portfolio only here, on the server, and copy ONLY the fields the
 * author chose to disclose into dedicated tables. The share never references a
 * live query against the private portfolio.
 */
export async function createShare(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in." };
  const parsed = createShareSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid share." };
  }
  const supabase = await createClient();
  const built = await insertShare(supabase, user.id, parsed.data);
  if (!built.ok) return { ok: false, error: built.error };

  revalidatePath("/community");
  return { ok: true, data: { id: built.shareId } };
}

/**
 * Publish a portfolio share DIRECTLY to the community feed as a
 * `portfolio_review` post, in one server action. This is the path the composer
 * uses so a share actually appears in the feed (not just on its own page).
 *
 * Ordering is chosen to avoid orphans: the self-contained share + its holdings
 * are written first; only then is the post created and linked. If the post
 * insert fails, the share is rolled back (deleted) so we never leave a share
 * with no post from this flow. A `portfolio_review` post always has a valid
 * linked share, and the share's holdings always exist before the post is shown.
 */
export async function createSharePost(
  input: unknown,
): Promise<ActionResult<{ postId: string; shareId: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in." };
  const parsed = createShareSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid share." };
  }
  if (await tooManyRecent("community_posts", user.id, POST_RATE_LIMIT)) {
    return { ok: false, error: "You're posting too fast. Try again in a bit." };
  }
  const v = parsed.data;
  const supabase = await createClient();

  const built = await insertShare(supabase, user.id, v);
  if (!built.ok) return { ok: false, error: built.error };

  const body = (v.postBody ?? "").trim() || v.title;
  const { data: post, error: postError } = await supabase
    .from("community_posts")
    .insert({
      author_id: user.id,
      post_type: "portfolio_review",
      body,
      portfolio_share_id: built.shareId,
      hashtags: extractHashtags(body),
    })
    .select("id")
    .single();

  if (postError || !post) {
    // Roll back the share so this flow never leaves a share with no post.
    await supabase
      .from("community_portfolio_shares")
      .delete()
      .eq("id", built.shareId)
      .eq("owner_id", user.id);
    return { ok: false, error: "Could not publish the portfolio to the feed." };
  }

  // Mentions (best-effort), consistent with createPost.
  const recipients = await resolveMentionRecipients(extractMentions(body));
  for (const r of recipients) {
    await notify({ recipientId: r, actorId: user.id, type: "mention", postId: post.id });
  }

  revalidatePath("/community");
  return { ok: true, data: { postId: post.id, shareId: built.shareId } };
}

/**
 * Shared internal: build the server-side snapshot from the user's OWN data and
 * write the share (+ disclosed holdings). Returns the new share id. Never
 * trusts client-supplied values — the snapshot is computed from authoritative
 * records in buildShareRiskSnapshot (which is owner-scoped). Only the fields
 * the author disclosed are persisted.
 */
async function insertShare(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  v: CreateShareInput,
): Promise<{ ok: true; shareId: string } | { ok: false; error: string }> {
  const { holdings, riskSnapshot } = await buildShareRiskSnapshot({
    userId,
    sourcePortfolioId: v.sourcePortfolioId ?? null,
    manualHoldings: v.manualHoldings ?? null,
    isHypothetical: v.isHypothetical,
  });
  if (holdings.length === 0) {
    return {
      ok: false,
      error: "Add at least one holding (or select a non-empty portfolio).",
    };
  }

  const risk: ShareRiskSnapshot | null = v.showRiskMetrics ? riskSnapshot : null;

  const { data: share, error } = await supabase
    .from("community_portfolio_shares")
    .insert({
      owner_id: userId,
      source_portfolio_id: v.isHypothetical ? null : v.sourcePortfolioId ?? null,
      title: v.title,
      notes: v.notes ?? null,
      visibility: v.visibility,
      is_hypothetical: v.isHypothetical,
      show_holdings: v.showHoldings,
      show_quantities: v.showQuantities,
      show_amounts: v.showAmounts,
      show_allocations: v.showAllocations,
      show_sectors: v.showSectors,
      show_risk_metrics: v.showRiskMetrics,
      objective: v.objective ?? null,
      horizon: v.horizon ?? null,
      risk_tolerance: v.riskTolerance ?? null,
      feedback_wanted: v.feedbackWanted ?? null,
      risk_snapshot: risk,
    })
    .select("id")
    .single();
  if (error || !share) return { ok: false, error: "Could not create the share." };

  // Store holding rows only when the author disclosed holdings. Each field is
  // included ONLY if its disclosure flag is on — nulls otherwise.
  if (v.showHoldings) {
    const rows = holdings.map((h, i) => ({
      share_id: share.id,
      symbol: h.symbol,
      name: h.name, // name is low-sensitivity, always included with holdings
      sector: v.showSectors ? h.sector : null,
      allocation_pct: v.showAllocations ? h.allocationPct : null,
      quantity: v.showQuantities ? h.quantity : null,
      invested_amount: v.showAmounts ? h.investedAmount : null,
      position: i,
    }));
    const { error: holdingsError } = await supabase
      .from("community_portfolio_share_holdings")
      .insert(rows);
    if (holdingsError) {
      // Avoid a share with partial/missing holdings: roll it back.
      await supabase
        .from("community_portfolio_shares")
        .delete()
        .eq("id", share.id)
        .eq("owner_id", userId);
      return { ok: false, error: "Could not save the portfolio snapshot." };
    }
  }

  return { ok: true, shareId: share.id };
}

/** Revoke a share (owner only). The snapshot rows are kept; it becomes hidden. */
export async function revokeShare(shareId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("community_portfolio_shares")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", shareId)
    .eq("owner_id", user.id);
  if (error) return { ok: false, error: "Could not revoke the share." };
  revalidatePath(`/community/portfolio/${shareId}`);
  return { ok: true };
}

/** Submit a structured review on a share. One per reviewer per share (DB). */
export async function createReview(input: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in." };
  const parsed = createReviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a valid review." };
  const v = parsed.data;
  const supabase = await createClient();

  const { data: share } = await supabase
    .from("community_portfolio_shares")
    .select("id, owner_id, revoked_at")
    .eq("id", v.shareId)
    .maybeSingle();
  if (!share || share.revoked_at) return { ok: false, error: "This share is not accepting reviews." };
  if (share.owner_id === user.id) return { ok: false, error: "You can't review your own share." };

  const { error } = await supabase.from("community_portfolio_reviews").insert({
    share_id: v.shareId,
    reviewer_id: user.id,
    diversification_rating: v.diversificationRating ?? null,
    concentration_rating: v.concentrationRating ?? null,
    sector_balance_rating: v.sectorBalanceRating ?? null,
    risk_alignment_rating: v.riskAlignmentRating ?? null,
    comment: v.comment ?? null,
  });
  if (error) {
    if (error.message.includes("duplicate")) return { ok: false, error: "You've already reviewed this share." };
    return { ok: false, error: "Could not submit the review." };
  }
  await notify({ recipientId: share.owner_id, actorId: user.id, type: "review", shareId: v.shareId });
  revalidatePath(`/community/portfolio/${v.shareId}`);
  return { ok: true };
}

/** Mark all of the viewer's notifications as read. */
export async function markNotificationsRead(): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in." };
  const supabase = await createClient();
  await supabase
    .from("community_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", user.id)
    .is("read_at", null);
  revalidatePath("/community/notifications");
  return { ok: true };
}
