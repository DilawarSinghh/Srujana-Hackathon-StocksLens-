import { describe, it, expect } from "vitest";
import { createPostSchema, createCommentSchema, POST_BODY_MAX, POLL_OPTION_MAX } from "./schemas";

const future = () => new Date(Date.now() + 86_400_000).toISOString();

describe("createPostSchema", () => {
  it("accepts a minimal discussion post", () => {
    const r = createPostSchema.safeParse({ body: "hello" });
    expect(r.success).toBe(true);
  });

  it("rejects an empty body", () => {
    expect(createPostSchema.safeParse({ body: "   " }).success).toBe(false);
  });

  it("rejects an oversized body", () => {
    expect(createPostSchema.safeParse({ body: "x".repeat(POST_BODY_MAX + 1) }).success).toBe(false);
  });

  it("uppercases symbols and caps at 5", () => {
    const r = createPostSchema.safeParse({ body: "hi", symbols: ["tcs", "infy"] });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.symbols).toEqual(["TCS", "INFY"]);
    expect(createPostSchema.safeParse({ body: "hi", symbols: ["a", "b", "c", "d", "e", "f"] }).success).toBe(false);
  });

  it("requires a stock for analysis and thesis posts", () => {
    expect(createPostSchema.safeParse({ postType: "analysis", body: "hi", symbols: [] }).success).toBe(false);
    expect(createPostSchema.safeParse({ postType: "thesis", body: "hi", symbols: [] }).success).toBe(false);
    expect(createPostSchema.safeParse({ postType: "analysis", body: "hi", symbols: ["TCS"] }).success).toBe(true);
  });

  it("requires a linked share for portfolio reviews", () => {
    expect(createPostSchema.safeParse({ postType: "portfolio_review", body: "review me" }).success).toBe(false);
    const ok = createPostSchema.safeParse({
      postType: "portfolio_review",
      body: "review me",
      portfolioShareId: "11111111-1111-1111-1111-111111111111",
    });
    expect(ok.success).toBe(true);
  });

  describe("poll validation", () => {
    it("requires a question, 2+ options, and a future close time", () => {
      expect(createPostSchema.safeParse({ postType: "poll", body: "" }).success).toBe(false);
      expect(
        createPostSchema.safeParse({
          postType: "poll",
          body: "x",
          pollQuestion: "Up or down?",
          pollOptions: ["Up"],
          pollClosesAt: future(),
        }).success,
      ).toBe(false);
      expect(
        createPostSchema.safeParse({
          postType: "poll",
          body: "x",
          pollQuestion: "Up or down?",
          pollOptions: ["Up", "Down"],
          pollClosesAt: future(),
        }).success,
      ).toBe(true);
    });

    it("rejects a past close time", () => {
      expect(
        createPostSchema.safeParse({
          postType: "poll",
          body: "x",
          pollQuestion: "q",
          pollOptions: ["a", "b"],
          pollClosesAt: new Date(Date.now() - 1000).toISOString(),
        }).success,
      ).toBe(false);
    });

    it("rejects too many options", () => {
      expect(
        createPostSchema.safeParse({
          postType: "poll",
          body: "x",
          pollQuestion: "q",
          pollOptions: Array.from({ length: POLL_OPTION_MAX + 1 }, (_, i) => `o${i}`),
          pollClosesAt: future(),
        }).success,
      ).toBe(false);
    });
  });
});

describe("createCommentSchema", () => {
  it("requires a uuid post id and non-empty body", () => {
    expect(createCommentSchema.safeParse({ postId: "not-a-uuid", body: "hi" }).success).toBe(false);
    expect(
      createCommentSchema.safeParse({ postId: "11111111-1111-1111-1111-111111111111", body: "hi" }).success,
    ).toBe(true);
  });
});
