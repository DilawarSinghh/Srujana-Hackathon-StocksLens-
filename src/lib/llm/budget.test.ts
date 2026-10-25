import { describe, it, expect } from "vitest";
import { approxTokens, selectChunks, trimHistory } from "./budget";

describe("approxTokens", () => {
  it("estimates ~chars/4 rounded up", () => {
    expect(approxTokens("")).toBe(0);
    expect(approxTokens("abcd")).toBe(1);
    expect(approxTokens("abcde")).toBe(2);
  });
});

describe("selectChunks", () => {
  const mk = (id: string, similarity: number, len: number) => ({
    id,
    similarity,
    content: "x".repeat(len),
  });

  it("keeps the highest-similarity chunks first", () => {
    const chunks = [mk("a", 0.3, 40), mk("b", 0.9, 40), mk("c", 0.6, 40)];
    const out = selectChunks(chunks, {
      topK: 2,
      maxContextTokens: 1000,
      maxCharsPerChunk: 100,
    });
    expect(out.map((c) => c.id)).toEqual(["b", "c"]);
  });

  it("caps each chunk's characters", () => {
    const out = selectChunks([mk("a", 0.9, 500)], {
      topK: 5,
      maxContextTokens: 1000,
      maxCharsPerChunk: 100,
    });
    expect(out[0].content.length).toBe(100);
  });

  it("stops adding chunks once the token budget is exceeded", () => {
    // Each chunk is 400 chars -> ~100 tokens. Budget 150 tokens allows ~1.
    const chunks = [mk("a", 0.9, 400), mk("b", 0.8, 400), mk("c", 0.7, 400)];
    const out = selectChunks(chunks, {
      topK: 5,
      maxContextTokens: 150,
      maxCharsPerChunk: 400,
    });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("a");
  });

  it("always keeps at least the single best chunk", () => {
    const out = selectChunks([mk("a", 0.9, 4000)], {
      topK: 5,
      maxContextTokens: 10, // far too small
      maxCharsPerChunk: 4000,
    });
    expect(out).toHaveLength(1);
  });
});

describe("trimHistory", () => {
  const turn = (role: "user" | "assistant", len: number) => ({
    role,
    content: "y".repeat(len),
  });

  it("keeps the most recent turns within budget, in order", () => {
    // 3 turns of 400 chars (~100 tokens each); budget 150 keeps the newest 1.
    const hist = [turn("user", 400), turn("assistant", 400), turn("user", 400)];
    const out = trimHistory(hist, 150);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(hist[2]);
  });

  it("returns everything when it all fits and preserves order", () => {
    const hist = [turn("user", 4), turn("assistant", 4)];
    const out = trimHistory(hist, 1000);
    expect(out).toEqual(hist);
  });
});
