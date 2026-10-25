import { describe, it, expect } from "vitest";
import { sanitizeQuery, buildQueries } from "./queries";

describe("sanitizeQuery", () => {
  it("strips quotes and operator characters", () => {
    expect(sanitizeQuery('revenue "growth" -site:x (2024)')).toBe(
      "revenue growth site x 2024",
    );
  });
});

describe("buildQueries", () => {
  it("builds up to 3 de-duplicated queries biased to the company", () => {
    const qs = buildQueries({
      company: "Tata Motors",
      symbol: "TATAMOTORS",
      question: "latest quarterly revenue",
    });
    expect(qs.length).toBeGreaterThanOrEqual(1);
    expect(qs.length).toBeLessThanOrEqual(3);
    expect(qs[0]).toContain("Tata Motors");
    expect(qs[0]).toContain("TATAMOTORS");
    expect(qs[0]).toContain("latest quarterly revenue");
  });

  it("de-duplicates when question is empty", () => {
    const qs = buildQueries({ company: "ACME", symbol: "ACME", question: "" });
    expect(new Set(qs).size).toBe(qs.length);
  });
});
