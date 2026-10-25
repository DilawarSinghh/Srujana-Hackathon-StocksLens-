import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  CommunityPostType,
  CommunityStance,
  StockCardSnapshot,
  ShareRiskSnapshot,
} from "@/types/database";
import {
  forYouScore,
  trendingScore,
  rankBy,
  TRENDING_WINDOW_HOURS,
  type RankablePost,
} from "@/lib/community/ranking";

export type FeedTab = "foryou" | "following" | "trending" | "latest";

/**
 * A compact, disclosure-respecting portfolio snapshot embedded in the feed so a
 * portfolio-share post can render inline without a second navigation. Only the
 * fields the author chose to disclose are ever populated here; hidden fields
 * stay null. Values are historical snapshot values, never live portfolio data.
 */
export interface PortfolioSharePreview {
  id: string;
  title: string;
  isHypothetical: boolean;
  revoked: boolean;
  createdAt: string;
  showHoldings: boolean;
  showAllocations: boolean;
  showSectors: boolean;
  showRiskMetrics: boolean;
  showQuantities: boolean;
  showAmounts: boolean;
  riskSnapshot: ShareRiskSnapshot | null;
  holdings: {
    symbol: string;
    name: string | null;
    sector: string | null;
    allocationPct: number | null;
    quantity: number | null;
    investedAmount: number | null;
  }[];
}

/** A post enriched for the feed / detail view. */
export interface FeedPost {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string | null;
  postType: CommunityPostType;
  body: string;
  stance: CommunityStance | null;
  timeHorizon: string | null;
  thesisRisks: string | null;
  createdAt: string;
  editedAt: string | null;
  likeCount: number;
  commentCount: number;
  repostCount: number;
  portfolioShareId: string | null;
  /** Disclosure-respecting snapshot for portfolio-review posts; null otherwise. */
  portfolioShare: PortfolioSharePreview | null;
  stocks: { symbol: string; snapshot: StockCardSnapshot | null }[];
  /** Original post when this row is a repost (shallow; no nested reposts). */
  repostOf: FeedPost | null;
  /** Whether the viewer has liked / bookmarked / reposted. */
  viewerLiked: boolean;
  viewerBookmarked: boolean;
  viewerReposted: boolean;
  /** Present only for poll posts. */
  poll: PollView | null;
}

export interface PollView {
  id: string;
  question: string;
  closesAt: string;
  closed: boolean;
  options: { id: string; label: string; votes: number }[];
  totalVotes: number;
  viewerOptionId: string | null;
}

const PAGE_SIZE = 20;

type ProfileLite = { id: string; full_name: string | null; avatar_url: string | null };

/** Fetch display profiles for a set of user ids. */
async function loadProfiles(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
): Promise<Map<string, ProfileLite>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  // profiles RLS only exposes the caller's own row, so public author names come
  // from a dedicated public view (see migration note). We fall back to a
  // generic handle when the name isn't visible.
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url")
    .in("id", unique);
  const map = new Map<string, ProfileLite>();
  for (const p of data ?? []) map.set(p.id, p);
  return map;
}

/**
 * Batch-load disclosure-respecting portfolio-share previews for a set of share
 * ids. RLS returns a share row only when it is public/unlisted (and not
 * revoked) or owned by the viewer, so this never leaks a private share.
 * Hidden fields are projected to null per the author's disclosure flags, so a
 * client can never receive a value the author didn't choose to show. Values are
 * the immutable snapshot captured at publish time, never live portfolio data.
 */
async function loadPortfolioShares(
  supabase: Awaited<ReturnType<typeof createClient>>,
  shareIds: string[],
): Promise<Map<string, PortfolioSharePreview>> {
  const map = new Map<string, PortfolioSharePreview>();
  if (shareIds.length === 0) return map;

  const { data: shares } = await supabase
    .from("community_portfolio_shares")
    .select(
      "id, title, is_hypothetical, revoked_at, created_at, show_holdings, show_allocations, show_sectors, show_risk_metrics, show_quantities, show_amounts, risk_snapshot",
    )
    .in("id", shareIds);
  if (!shares || shares.length === 0) return map;

  const visibleIds = shares.filter((s) => s.show_holdings).map((s) => s.id);
  const holdingsByShare = new Map<
    string,
    PortfolioSharePreview["holdings"]
  >();
  if (visibleIds.length > 0) {
    const { data: rows } = await supabase
      .from("community_portfolio_share_holdings")
      .select(
        "share_id, symbol, name, sector, allocation_pct, quantity, invested_amount, position",
      )
      .in("share_id", visibleIds)
      .order("position", { ascending: true });
    const flagById = new Map(shares.map((s) => [s.id, s]));
    for (const h of rows ?? []) {
      const s = flagById.get(h.share_id);
      const list = holdingsByShare.get(h.share_id) ?? [];
      // Defense in depth: project each field to null unless its flag is on,
      // mirroring the write-time gating in createShare and getShare().
      list.push({
        symbol: h.symbol,
        name: h.name,
        sector: s?.show_sectors ? h.sector : null,
        allocationPct: s?.show_allocations ? h.allocation_pct : null,
        quantity: s?.show_quantities ? h.quantity : null,
        investedAmount: s?.show_amounts ? h.invested_amount : null,
      });
      holdingsByShare.set(h.share_id, list);
    }
  }

  for (const s of shares) {
    map.set(s.id, {
      id: s.id,
      title: s.title,
      isHypothetical: s.is_hypothetical,
      revoked: !!s.revoked_at,
      createdAt: s.created_at,
      showHoldings: s.show_holdings,
      showAllocations: s.show_allocations,
      showSectors: s.show_sectors,
      showRiskMetrics: s.show_risk_metrics,
      showQuantities: s.show_quantities,
      showAmounts: s.show_amounts,
      // Only surface the risk snapshot when the author disclosed it.
      riskSnapshot: s.show_risk_metrics
        ? ((s.risk_snapshot as ShareRiskSnapshot | null) ?? null)
        : null,
      // Holdings exist only when disclosed; already gated above.
      holdings: s.show_holdings ? holdingsByShare.get(s.id) ?? [] : [],
    });
  }
  return map;
}

/**
 * The viewer's follow + engagement context, used for For You ranking and to
 * mark liked/bookmarked/reposted state. Returns empty sets when signed out.
 */
async function loadViewerContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  viewerId: string | null,
  postIds: string[],
): Promise<{
  followedUserIds: Set<string>;
  followedSymbols: Set<string>;
  liked: Set<string>;
  bookmarked: Set<string>;
  reposted: Set<string>;
  blocked: Set<string>;
}> {
  const empty = {
    followedUserIds: new Set<string>(),
    followedSymbols: new Set<string>(),
    liked: new Set<string>(),
    bookmarked: new Set<string>(),
    reposted: new Set<string>(),
    blocked: new Set<string>(),
  };
  if (!viewerId) return empty;

  const [follows, stockFollows, likes, bookmarks, reposts, blocks] =
    await Promise.all([
      supabase.from("community_follows").select("followee_id").eq("follower_id", viewerId),
      supabase
        .from("community_stock_follows")
        .select("stock_id, stocks(symbol)")
        .eq("user_id", viewerId),
      postIds.length
        ? supabase
            .from("community_post_likes")
            .select("post_id")
            .eq("user_id", viewerId)
            .in("post_id", postIds)
        : Promise.resolve({ data: [] as { post_id: string }[] }),
      postIds.length
        ? supabase
            .from("community_bookmarks")
            .select("post_id")
            .eq("user_id", viewerId)
            .in("post_id", postIds)
        : Promise.resolve({ data: [] as { post_id: string }[] }),
      supabase.from("community_posts").select("repost_of").eq("author_id", viewerId).not("repost_of", "is", null),
      supabase.from("community_blocks").select("blocked_id").eq("blocker_id", viewerId),
    ]);

  return {
    followedUserIds: new Set((follows.data ?? []).map((f) => f.followee_id)),
    followedSymbols: new Set(
      (stockFollows.data ?? [])
        .map((r) => (r as unknown as { stocks: { symbol: string } | null }).stocks?.symbol)
        .filter((s): s is string => !!s),
    ),
    liked: new Set((likes.data ?? []).map((l) => l.post_id)),
    bookmarked: new Set((bookmarks.data ?? []).map((b) => b.post_id)),
    reposted: new Set(
      (reposts.data ?? [])
        .map((r) => r.repost_of)
        .filter((id): id is string => !!id),
    ),
    blocked: new Set((blocks.data ?? []).map((b) => b.blocked_id)),
  };
}

/** Hydrate a batch of raw post rows into FeedPosts (stocks, polls, viewer state). */
async function hydratePosts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: {
    id: string;
    author_id: string;
    post_type: CommunityPostType;
    body: string;
    stance: CommunityStance | null;
    time_horizon: string | null;
    thesis_risks: string | null;
    repost_of: string | null;
    portfolio_share_id: string | null;
    like_count: number;
    comment_count: number;
    repost_count: number;
    created_at: string;
    edited_at: string | null;
  }[],
  viewerId: string | null,
): Promise<FeedPost[]> {
  if (rows.length === 0) return [];

  // Resolve reposted originals (one level).
  const originalIds = rows.map((r) => r.repost_of).filter((x): x is string => !!x);
  let originals: typeof rows = [];
  if (originalIds.length) {
    const { data } = await supabase
      .from("community_posts")
      .select(
        "id, author_id, post_type, body, stance, time_horizon, thesis_risks, repost_of, portfolio_share_id, like_count, comment_count, repost_count, created_at, edited_at",
      )
      .in("id", originalIds)
      .is("deleted_at", null);
    originals = (data ?? []) as typeof rows;
  }

  const allRows = [...rows, ...originals];
  const allIds = allRows.map((r) => r.id);
  const authorIds = allRows.map((r) => r.author_id);

  // Portfolio-share ids referenced by these posts (dedup → one batched fetch,
  // no N+1). RLS still gates which shares/holdings are actually returned.
  const shareIds = [
    ...new Set(
      allRows.map((r) => r.portfolio_share_id).filter((x): x is string => !!x),
    ),
  ];

  const [profiles, stocksRes, pollRes, shareMap, viewer] = await Promise.all([
    loadProfiles(supabase, authorIds),
    supabase
      .from("community_post_stocks")
      .select("post_id, snapshot, stocks(symbol)")
      .in("post_id", allIds),
    supabase.from("community_polls").select("id, post_id, question, closes_at").in("post_id", allIds),
    loadPortfolioShares(supabase, shareIds),
    loadViewerContext(supabase, viewerId, allIds),
  ]);

  // Group stocks per post.
  const stocksByPost = new Map<string, { symbol: string; snapshot: StockCardSnapshot | null }[]>();
  for (const r of stocksRes.data ?? []) {
    const sym = (r as unknown as { stocks: { symbol: string } | null }).stocks?.symbol ?? "?";
    const list = stocksByPost.get(r.post_id) ?? [];
    list.push({ symbol: sym, snapshot: (r.snapshot as StockCardSnapshot | null) ?? null });
    stocksByPost.set(r.post_id, list);
  }

  // Poll views (with votes + viewer's vote).
  const pollByPost = new Map<string, PollView>();
  const polls = pollRes.data ?? [];
  if (polls.length) {
    const pollIds = polls.map((p) => p.id);
    const [optRes, voteRes, myVoteRes] = await Promise.all([
      supabase.from("community_poll_options").select("id, poll_id, label, position").in("poll_id", pollIds),
      supabase.from("community_poll_votes").select("poll_id, option_id").in("poll_id", pollIds),
      viewerId
        ? supabase.from("community_poll_votes").select("poll_id, option_id").eq("user_id", viewerId).in("poll_id", pollIds)
        : Promise.resolve({ data: [] as { poll_id: string; option_id: string }[] }),
    ]);
    const votesByOption = new Map<string, number>();
    for (const v of voteRes.data ?? []) {
      votesByOption.set(v.option_id, (votesByOption.get(v.option_id) ?? 0) + 1);
    }
    const myVoteByPoll = new Map((myVoteRes.data ?? []).map((v) => [v.poll_id, v.option_id]));
    const optsByPoll = new Map<string, { id: string; label: string; position: number }[]>();
    for (const o of optRes.data ?? []) {
      const list = optsByPoll.get(o.poll_id) ?? [];
      list.push(o);
      optsByPoll.set(o.poll_id, list);
    }
    const now = Date.now();
    for (const p of polls) {
      const opts = (optsByPoll.get(p.id) ?? []).sort((a, b) => a.position - b.position);
      const options = opts.map((o) => ({ id: o.id, label: o.label, votes: votesByOption.get(o.id) ?? 0 }));
      pollByPost.set(p.post_id, {
        id: p.id,
        question: p.question,
        closesAt: p.closes_at,
        closed: new Date(p.closes_at).getTime() <= now,
        options,
        totalVotes: options.reduce((s, o) => s + o.votes, 0),
        viewerOptionId: myVoteByPoll.get(p.id) ?? null,
      });
    }
  }

  const build = (r: (typeof allRows)[number], withRepost: boolean): FeedPost => {
    const prof = profiles.get(r.author_id);
    return {
      id: r.id,
      authorId: r.author_id,
      authorName: prof?.full_name ?? "Investor",
      authorAvatar: prof?.avatar_url ?? null,
      postType: r.post_type,
      body: r.body,
      stance: r.stance,
      timeHorizon: r.time_horizon,
      thesisRisks: r.thesis_risks,
      createdAt: r.created_at,
      editedAt: r.edited_at,
      likeCount: r.like_count,
      commentCount: r.comment_count,
      repostCount: r.repost_count,
      portfolioShareId: r.portfolio_share_id,
      portfolioShare: r.portfolio_share_id
        ? shareMap.get(r.portfolio_share_id) ?? null
        : null,
      stocks: stocksByPost.get(r.id) ?? [],
      repostOf:
        withRepost && r.repost_of
          ? (() => {
              const orig = originals.find((o) => o.id === r.repost_of);
              return orig ? build(orig, false) : null;
            })()
          : null,
      viewerLiked: viewer.liked.has(r.id),
      viewerBookmarked: viewer.bookmarked.has(r.id),
      viewerReposted: viewer.reposted.has(r.id),
      poll: pollByPost.get(r.id) ?? null,
    };
  };

  return rows
    .filter((r) => !viewer.blocked.has(r.author_id))
    .map((r) => build(r, true));
}

const POST_COLUMNS =
  "id, author_id, post_type, body, stance, time_horizon, thesis_risks, repost_of, portfolio_share_id, like_count, comment_count, repost_count, created_at, edited_at";

/**
 * Load one page of the feed for a given tab. Pagination is cursor-based on
 * created_at for the chronological tabs; the ranked tabs fetch a bounded recent
 * window and sort in code (documented, deterministic).
 */
export async function getFeed(opts: {
  tab: FeedTab;
  viewerId: string | null;
  cursor?: string | null; // ISO created_at cursor for latest/following
  /** Optional content-type filter, applied across every tab. */
  postType?: CommunityPostType | null;
}): Promise<{ posts: FeedPost[]; nextCursor: string | null }> {
  const supabase = await createClient();
  const { tab, viewerId, cursor, postType } = opts;

  if (tab === "latest") {
    let q = supabase
      .from("community_posts")
      .select(POST_COLUMNS)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE + 1);
    if (postType) q = q.eq("post_type", postType);
    if (cursor) q = q.lt("created_at", cursor);
    const { data } = await q;
    const rows = (data ?? []).slice(0, PAGE_SIZE);
    const nextCursor =
      (data ?? []).length > PAGE_SIZE ? rows[rows.length - 1]?.created_at ?? null : null;
    return { posts: await hydratePosts(supabase, rows, viewerId), nextCursor };
  }

  if (tab === "following") {
    if (!viewerId) return { posts: [], nextCursor: null };
    const { data: follows } = await supabase
      .from("community_follows")
      .select("followee_id")
      .eq("follower_id", viewerId);
    const ids = (follows ?? []).map((f) => f.followee_id);
    if (ids.length === 0) return { posts: [], nextCursor: null };
    let q = supabase
      .from("community_posts")
      .select(POST_COLUMNS)
      .is("deleted_at", null)
      .in("author_id", ids)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE + 1);
    if (postType) q = q.eq("post_type", postType);
    if (cursor) q = q.lt("created_at", cursor);
    const { data } = await q;
    const rows = (data ?? []).slice(0, PAGE_SIZE);
    const nextCursor =
      (data ?? []).length > PAGE_SIZE ? rows[rows.length - 1]?.created_at ?? null : null;
    return { posts: await hydratePosts(supabase, rows, viewerId), nextCursor };
  }

  // Ranked tabs: fetch a bounded recent window, hydrate, then sort in code.
  const windowStart = new Date(
    Date.now() - TRENDING_WINDOW_HOURS * 3_600_000,
  ).toISOString();
  let rankedQ = supabase
    .from("community_posts")
    .select(POST_COLUMNS)
    .is("deleted_at", null)
    .gte("created_at", tab === "trending" ? windowStart : "1970-01-01")
    .order("created_at", { ascending: false })
    .limit(200);
  if (postType) rankedQ = rankedQ.eq("post_type", postType);
  const { data } = await rankedQ;
  let posts = await hydratePosts(supabase, data ?? [], viewerId);

  const rankable = (p: FeedPost): RankablePost => ({
    id: p.id,
    authorId: p.authorId,
    createdAt: p.createdAt,
    likeCount: p.likeCount,
    commentCount: p.commentCount,
    repostCount: p.repostCount,
    symbols: p.stocks.map((s) => s.symbol),
  });

  if (tab === "trending") {
    posts = rankBy(posts, (p) => trendingScore(rankable(p))).filter(
      (p) => trendingScore(rankable(p)) > 0,
    );
  } else {
    // foryou
    const viewer = await loadViewerContext(
      supabase,
      viewerId,
      posts.map((p) => p.id),
    );
    posts = rankBy(posts, (p) =>
      forYouScore(rankable(p), {
        followedUserIds: viewer.followedUserIds,
        followedSymbols: viewer.followedSymbols,
      }),
    );
  }
  return { posts: posts.slice(0, PAGE_SIZE), nextCursor: null };
}

/** Posts referencing a given #hashtag, newest first. */
export async function getPostsByTag(
  tag: string,
  viewerId: string | null,
): Promise<FeedPost[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("community_posts")
    .select(POST_COLUMNS)
    .is("deleted_at", null)
    .contains("hashtags", [tag.toLowerCase()])
    .order("created_at", { ascending: false })
    .limit(50);
  return hydratePosts(supabase, data ?? [], viewerId);
}

/** Posts attached to a given stock symbol, newest first. */
export async function getPostsByStock(
  symbol: string,
  viewerId: string | null,
): Promise<FeedPost[]> {
  const supabase = await createClient();
  const { data: stock } = await supabase
    .from("stocks")
    .select("id")
    .eq("symbol", symbol.toUpperCase())
    .maybeSingle();
  if (!stock) return [];
  const { data: links } = await supabase
    .from("community_post_stocks")
    .select("post_id")
    .eq("stock_id", stock.id)
    .limit(100);
  const ids = (links ?? []).map((l) => l.post_id);
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from("community_posts")
    .select(POST_COLUMNS)
    .in("id", ids)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  return hydratePosts(supabase, data ?? [], viewerId);
}

/** Posts authored by a given user, newest first. */
export async function getPostsByAuthor(
  authorId: string,
  viewerId: string | null,
): Promise<FeedPost[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("community_posts")
    .select(POST_COLUMNS)
    .eq("author_id", authorId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  return hydratePosts(supabase, data ?? [], viewerId);
}

/** The viewer's bookmarked posts, newest bookmark first. */
export async function getBookmarkedPosts(viewerId: string): Promise<FeedPost[]> {
  const supabase = await createClient();
  const { data: marks } = await supabase
    .from("community_bookmarks")
    .select("post_id, created_at")
    .eq("user_id", viewerId)
    .order("created_at", { ascending: false })
    .limit(50);
  const ids = (marks ?? []).map((m) => m.post_id);
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from("community_posts")
    .select(POST_COLUMNS)
    .in("id", ids)
    .is("deleted_at", null);
  const posts = await hydratePosts(supabase, data ?? [], viewerId);
  // Preserve bookmark order.
  const order = new Map(ids.map((id, i) => [id, i]));
  return posts.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/** Load a single post with its comment thread. */
export async function getPostDetail(
  postId: string,
  viewerId: string | null,
): Promise<{ post: FeedPost; comments: CommentNode[] } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("community_posts")
    .select(POST_COLUMNS)
    .eq("id", postId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  const [post] = await hydratePosts(supabase, [data], viewerId);
  if (!post) return null;
  const comments = await getComments(postId, viewerId);
  return { post, comments };
}

export interface CommentNode {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string | null;
  body: string;
  createdAt: string;
  editedAt: string | null;
  likeCount: number;
  viewerLiked: boolean;
  replies: CommentNode[];
}

/** Load comments for a post as a 2-level tree, chronological. */
export async function getComments(
  postId: string,
  viewerId: string | null,
): Promise<CommentNode[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("community_comments")
    .select("id, author_id, parent_id, body, like_count, created_at, edited_at")
    .eq("post_id", postId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const profiles = await loadProfiles(supabase, rows.map((r) => r.author_id));
  let liked = new Set<string>();
  if (viewerId) {
    const { data: likes } = await supabase
      .from("community_comment_likes")
      .select("comment_id")
      .eq("user_id", viewerId)
      .in("comment_id", rows.map((r) => r.id));
    liked = new Set((likes ?? []).map((l) => l.comment_id));
  }

  const toNode = (r: (typeof rows)[number]): CommentNode => {
    const prof = profiles.get(r.author_id);
    return {
      id: r.id,
      authorId: r.author_id,
      authorName: prof?.full_name ?? "Investor",
      authorAvatar: prof?.avatar_url ?? null,
      body: r.body,
      createdAt: r.created_at,
      editedAt: r.edited_at,
      likeCount: r.like_count,
      viewerLiked: liked.has(r.id),
      replies: [],
    };
  };

  const byId = new Map<string, CommentNode>();
  const roots: CommentNode[] = [];
  for (const r of rows) byId.set(r.id, toNode(r));
  for (const r of rows) {
    const node = byId.get(r.id)!;
    if (r.parent_id && byId.has(r.parent_id)) byId.get(r.parent_id)!.replies.push(node);
    else roots.push(node);
  }
  return roots;
}
