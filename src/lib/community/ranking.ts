/**
 * Transparent, deterministic feed ranking. No ML. All inputs are observable
 * and the formulas are documented so the ordering can be reasoned about.
 *
 * These are PURE functions over already-fetched rows so they are easy to unit
 * test and cheap to run server-side after a bounded query.
 */

export interface RankablePost {
  id: string;
  authorId: string;
  createdAt: string; // ISO
  likeCount: number;
  commentCount: number;
  repostCount: number;
  /** Symbols attached to the post (uppercase). */
  symbols: string[];
}

/** Engagement score: comments weigh most (discussion), then reposts, likes. */
export function engagementScore(p: {
  likeCount: number;
  commentCount: number;
  repostCount: number;
}): number {
  return p.likeCount * 1 + p.repostCount * 2 + p.commentCount * 3;
}

/** Hours since a timestamp, clamped at >= 0. */
export function ageHours(createdAt: string, now: number = Date.now()): number {
  return Math.max(0, (now - new Date(createdAt).getTime()) / 3_600_000);
}

/**
 * "For You" score. Combines:
 *   - recency decay (half-life ~18h),
 *   - engagement (log-dampened so a viral post can't fully dominate),
 *   - an affinity bonus when the post is authored by someone the viewer
 *     follows, or references a stock the viewer follows.
 * Deterministic given the same inputs.
 */
export function forYouScore(
  p: RankablePost,
  ctx: {
    now?: number;
    followedUserIds: Set<string>;
    followedSymbols: Set<string>;
  },
): number {
  const now = ctx.now ?? Date.now();
  const recency = Math.pow(0.5, ageHours(p.createdAt, now) / 18);
  const engagement = Math.log1p(engagementScore(p));
  let affinity = 0;
  if (ctx.followedUserIds.has(p.authorId)) affinity += 1.5;
  if (p.symbols.some((s) => ctx.followedSymbols.has(s))) affinity += 1.0;
  // Weighted blend. Recency and engagement are the backbone; affinity nudges.
  return recency * 2 + engagement * 1 + affinity;
}

/**
 * Trending score over a documented window. Only posts created within
 * `windowHours` (default 48h) are eligible; among those, rank by engagement
 * per hour of age (so fresh posts gaining traction rise). Posts outside the
 * window get a score of 0 (filtered by the caller).
 */
export const TRENDING_WINDOW_HOURS = 48;

export function trendingScore(
  p: RankablePost,
  now: number = Date.now(),
  windowHours: number = TRENDING_WINDOW_HOURS,
): number {
  const age = ageHours(p.createdAt, now);
  if (age > windowHours) return 0;
  const eng = engagementScore(p);
  // velocity = engagement / (age + 2h cushion so brand-new posts aren't ∞).
  return eng / (age + 2);
}

/** Sort a copy of posts by a scoring function, descending; stable by id. */
export function rankBy<T extends { id: string }>(
  posts: T[],
  score: (p: T) => number,
): T[] {
  return [...posts]
    .map((p) => ({ p, s: score(p) }))
    .sort((a, b) => b.s - a.s || (a.p.id < b.p.id ? -1 : 1))
    .map((x) => x.p);
}
