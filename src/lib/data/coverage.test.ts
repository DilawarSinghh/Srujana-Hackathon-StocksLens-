import { describe, it, expect } from "vitest";
import { classifyCoverage, STALE_AFTER_DAYS } from "./coverage";
import { LABELS } from "@/lib/scoring/constants";
import type { StockListItem } from "@/lib/data/stocks";

const NOW = new Date("2026-02-01T00:00:00Z");

function item(overrides: Partial<StockListItem>): StockListItem {
  return {
    id: "s1",
    symbol: "TEST",
    name: "Test Ltd",
    sector: "Energy",
    exchange: "NSE",
    cap_category: "large",
    price: 100,
    prev_close: 99,
    debt_to_equity: 0.3,
    dividend_yield: 1.2,
    dividend_safety: null,
    pe: 20,
    roe: 15,
    total_score: 72,
    label: "Strong fundamentals",
    growth: 60,
    capped: false,
    data_confidence: 0.9,
    red_flags: [],
    as_of: "2026-01-31", // fresh relative to NOW
    ...overrides,
  };
}

describe("classifyCoverage", () => {
  it("reports a fresh, fully-scored stock as 'scored' and shows the score", () => {
    const c = classifyCoverage(item({}), NOW);
    expect(c.status).toBe("scored");
    expect(c.showScore).toBe(true);
  });

  it("flags a limited-data score as 'limited' but still shows it", () => {
    const c = classifyCoverage(item({ label: LABELS.limited }), NOW);
    expect(c.status).toBe("limited");
    expect(c.showScore).toBe(true);
    expect(c.reason).toMatch(/partial data/i);
  });

  it("classifies a priced-but-unscored stock as 'no_fundamentals' (no score shown)", () => {
    const c = classifyCoverage(item({ total_score: null, label: null }), NOW);
    expect(c.status).toBe("no_fundamentals");
    expect(c.showScore).toBe(false);
    expect(c.reason).toMatch(/fundamental data/i);
  });

  it("classifies a stock with no price as 'no_price' (just discovered)", () => {
    const c = classifyCoverage(
      item({ price: null, prev_close: null, total_score: null, label: null, as_of: null }),
      NOW,
    );
    expect(c.status).toBe("no_price");
    expect(c.showScore).toBe(false);
  });

  it("marks a scored-but-old stock as 'stale'", () => {
    const old = new Date(NOW.getTime() - (STALE_AFTER_DAYS + 3) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const c = classifyCoverage(item({ as_of: old }), NOW);
    expect(c.status).toBe("stale");
    expect(c.showScore).toBe(true);
    expect(c.reason).toMatch(/out of date/i);
  });

  it("never treats a null score as zero", () => {
    const c = classifyCoverage(item({ total_score: null, label: null }), NOW);
    // showScore false means the UI must not render a 0 — it shows the reason.
    expect(c.showScore).toBe(false);
  });
});
