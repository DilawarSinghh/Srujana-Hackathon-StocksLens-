import { describe, it, expect } from "vitest";
import {
  engagementScore,
  ageHours,
  forYouScore,
  trendingScore,
  rankBy,
  TRENDING_WINDOW_HOURS,
  type RankablePost,
} from "./ranking";

const now = Date.parse("2026-01-10T12:00:00Z");

function post(partial: Partial<RankablePost> & { id: string }): RankablePost {
  return {
    id: partial.id,
    authorId: partial.authorId ?? "u1",
    createdAt: partial.createdAt ?? new Date(now).toISOString(),
    likeCount: partial.likeCount ?? 0,
    commentCount: partial.commentCount ?? 0,
    repostCount: partial.repostCount ?? 0,
    symbols: partial.symbols ?? [],
  };
}

describe("engagementScore", () => {
  it("weights comments > reposts > likes", () => {
    expect(engagementScore({ likeCount: 1, commentCount: 0, repostCount: 0 })).toBe(1);
    expect(engagementScore({ likeCount: 0, commentCount: 0, repostCount: 1 })).toBe(2);
    expect(engagementScore({ likeCount: 0, commentCount: 1, repostCount: 0 })).toBe(3);
  });
});

describe("ageHours", () => {
  it("is zero for a future/now timestamp and positive for the past", () => {
    expect(ageHours(new Date(now).toISOString(), now)).toBe(0);
    expect(ageHours(new Date(now - 3_600_000).toISOString(), now)).toBeCloseTo(1, 5);
    // Never negative.
    expect(ageHours(new Date(now + 3_600_000).toISOString(), now)).toBe(0);
  });
});

describe("forYouScore", () => {
  const ctx = { now, followedUserIds: new Set<string>(), followedSymbols: new Set<string>() };

  it("ranks a fresher post above an older one with equal engagement", () => {
    const fresh = post({ id: "a", createdAt: new Date(now - 3_600_000).toISOString() });
    const old = post({ id: "b", createdAt: new Date(now - 36 * 3_600_000).toISOString() });
    expect(forYouScore(fresh, ctx)).toBeGreaterThan(forYouScore(old, ctx));
  });

  it("gives an affinity bonus for followed authors and stocks", () => {
    const base = post({ id: "a", authorId: "x", symbols: ["TCS"] });
    const noAffinity = forYouScore(base, ctx);
    const withUser = forYouScore(base, { ...ctx, followedUserIds: new Set(["x"]) });
    const withStock = forYouScore(base, { ...ctx, followedSymbols: new Set(["TCS"]) });
    expect(withUser).toBeGreaterThan(noAffinity);
    expect(withStock).toBeGreaterThan(noAffinity);
  });

  it("is deterministic for identical inputs", () => {
    const p = post({ id: "a", likeCount: 5, commentCount: 2 });
    expect(forYouScore(p, ctx)).toBe(forYouScore(p, ctx));
  });
});

describe("trendingScore", () => {
  it("returns 0 for posts older than the window", () => {
    const stale = post({
      id: "a",
      createdAt: new Date(now - (TRENDING_WINDOW_HOURS + 1) * 3_600_000).toISOString(),
      likeCount: 100,
    });
    expect(trendingScore(stale, now)).toBe(0);
  });

  it("rewards engagement velocity (newer with same engagement ranks higher)", () => {
    const newer = post({ id: "a", createdAt: new Date(now - 2 * 3_600_000).toISOString(), likeCount: 10 });
    const older = post({ id: "b", createdAt: new Date(now - 20 * 3_600_000).toISOString(), likeCount: 10 });
    expect(trendingScore(newer, now)).toBeGreaterThan(trendingScore(older, now));
  });
});

describe("rankBy", () => {
  it("sorts descending by score with a stable id tiebreak", () => {
    const posts = [post({ id: "c" }), post({ id: "a" }), post({ id: "b" })];
    // Equal scores -> id ascending.
    const ranked = rankBy(posts, () => 1);
    expect(ranked.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });
});
