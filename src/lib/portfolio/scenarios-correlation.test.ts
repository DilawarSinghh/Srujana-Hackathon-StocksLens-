import { describe, it, expect } from "vitest";
import {
  computeCorrelationMatrix,
  computeVolatilityContributions,
  MIN_PAIR_OVERLAP_DAYS,
} from "./correlation";
import { runScenario, type Scenario } from "./scenarios";
import { compareAllocations } from "./comparison";
import type { PositionValue } from "./types";

// --- helpers ---------------------------------------------------------------
function returnsMap(values: number[], start = 1): Map<string, number> {
  const m = new Map<string, number>();
  values.forEach((v, i) => m.set(`2024-01-${String(start + i).padStart(2, "0")}`, v));
  return m;
}

function longSeries(fn: (i: number) => number, n = 80): number[] {
  return Array.from({ length: n }, (_, i) => fn(i));
}

function pos(
  symbol: string,
  sector: string | null,
  value: number | null,
  weight: number | null,
): PositionValue {
  return {
    symbol,
    name: symbol,
    sector,
    quantity: 1,
    avgBuyPrice: 1,
    currentPrice: value,
    value,
    weight,
    pnl: null,
    pnlPct: null,
  };
}

// --- correlation -----------------------------------------------------------
describe("computeCorrelationMatrix", () => {
  it("gives +1 for identical series and -1 for mirrored series", () => {
    const base = longSeries((i) => Math.sin(i / 3) * 0.01);
    const mirror = base.map((v) => -v);
    const r = computeCorrelationMatrix(["A", "B", "C"], new Map([
      ["A", returnsMap(base)],
      ["B", returnsMap(base)],
      ["C", returnsMap(mirror)],
    ]));
    // A/B identical
    const ab = r.pairs.find((p) => p.a === "A" && p.b === "B")!;
    expect(ab.value).toBeCloseTo(1, 6);
    // A/C mirrored
    const ac = r.pairs.find((p) => p.a === "A" && p.b === "C")!;
    expect(ac.value).toBeCloseTo(-1, 6);
    expect(r.matrix[0][0]).toBe(1);
  });

  it("returns null for pairs with insufficient overlap", () => {
    const short = longSeries((i) => i * 0.001, MIN_PAIR_OVERLAP_DAYS - 10);
    const r = computeCorrelationMatrix(["A", "B"], new Map([
      ["A", returnsMap(short)],
      ["B", returnsMap(short)],
    ]));
    expect(r.pairs[0].value).toBeNull();
    expect(r.averageCorrelation).toBeNull();
  });

  it("averages only available correlations", () => {
    const s = longSeries((i) => Math.cos(i / 5) * 0.01);
    const r = computeCorrelationMatrix(["A", "B"], new Map([
      ["A", returnsMap(s)],
      ["B", returnsMap(s)],
    ]));
    expect(r.averageCorrelation).toBeCloseTo(1, 6);
  });
});

describe("computeVolatilityContributions", () => {
  it("contributions sum to ~1 and equal weights for uncorrelated equal-vol assets", () => {
    // Two independent-ish series.
    const a = longSeries((i) => Math.sin(i) * 0.01);
    const b = longSeries((i) => Math.cos(i * 1.7) * 0.01);
    const res = computeVolatilityContributions(
      new Map([["A", 0.5], ["B", 0.5]]),
      new Map([["A", returnsMap(a)], ["B", returnsMap(b)]]),
    );
    const sum = res.contributions.reduce((s, c) => s + c.contribution, 0);
    expect(sum).toBeCloseTo(1, 6);
    expect(res.portfolioVolatility).not.toBeNull();
  });

  it("returns empty on insufficient history", () => {
    const short = longSeries((i) => i * 0.001, 10);
    const res = computeVolatilityContributions(
      new Map([["A", 1]]),
      new Map([["A", returnsMap(short)]]),
    );
    expect(res.contributions).toHaveLength(0);
    expect(res.portfolioVolatility).toBeNull();
  });
});

// --- scenarios -------------------------------------------------------------
const positions: PositionValue[] = [
  pos("TCS", "Information Technology", 60000, 0.6),
  pos("HDFCBANK", "Banking", 40000, 0.4),
];
const betas = new Map<string, number | null>([
  ["TCS", 1.2],
  ["HDFCBANK", 0.9],
]);

describe("runScenario", () => {
  it("market_decline scales by beta", () => {
    const s: Scenario = { type: "market_decline", marketShockPct: -10 };
    const r = runScenario(positions, betas, s);
    const tcs = r.perHolding.find((h) => h.symbol === "TCS")!;
    expect(tcs.impactPct).toBeCloseTo(-12, 6); // 1.2 * -10
    // total = (60000*-0.12 + 40000*-0.09) = -7200 -3600 = -10800 on 100000 = -10.8%
    expect(r.totalImpactValue).toBeCloseTo(-10800, 6);
    expect(r.totalImpactPct).toBeCloseTo(-10.8, 6);
  });

  it("sector_shock hits the chosen sector directly and spills over to others", () => {
    const s: Scenario = { type: "sector_shock", sector: "Banking", shockPct: -20, spillover: 0.25 };
    const r = runScenario(positions, betas, s);
    const bank = r.perHolding.find((h) => h.symbol === "HDFCBANK")!;
    const it = r.perHolding.find((h) => h.symbol === "TCS")!;
    expect(bank.impactPct).toBeCloseTo(-20, 6); // direct
    expect(it.impactPct).toBeCloseTo(1.2 * -20 * 0.25, 6); // beta*shock*spillover = -6
  });

  it("rate_change uses assumed sector sensitivity", () => {
    const s: Scenario = { type: "rate_change", bps: 100 };
    const r = runScenario(positions, betas, s);
    const bank = r.perHolding.find((h) => h.symbol === "HDFCBANK")!;
    const it = r.perHolding.find((h) => h.symbol === "TCS")!;
    // Banking -1.2 per 100bps; IT -0.4 per 100bps
    expect(bank.impactPct).toBeCloseTo(-1.2, 6);
    expect(it.impactPct).toBeCloseTo(-0.4, 6);
  });

  it("currency_move uses assumed exposure (IT benefits from rupee weakness)", () => {
    const s: Scenario = { type: "currency_move", movePct: 5 }; // +5% rupee depreciation
    const r = runScenario(positions, betas, s);
    const it = r.perHolding.find((h) => h.symbol === "TCS")!;
    const bank = r.perHolding.find((h) => h.symbol === "HDFCBANK")!;
    expect(it.impactPct).toBeCloseTo(0.8 * 5, 6); // +4%
    expect(bank.impactPct).toBeCloseTo(0, 6);
  });

  it("assumes beta=1 when missing and flags it", () => {
    const s: Scenario = { type: "market_decline", marketShockPct: -10 };
    const r = runScenario(positions, new Map([["TCS", null], ["HDFCBANK", null]]), s);
    expect(r.perHolding.every((h) => h.assumed)).toBe(true);
    expect(r.totalImpactPct).toBeCloseTo(-10, 6);
  });

  it("handles an empty portfolio", () => {
    const r = runScenario([], betas, { type: "market_decline", marketShockPct: -10 });
    expect(r.totalValue).toBe(0);
    expect(r.totalImpactPct).toBe(0);
    expect(r.perHolding).toHaveLength(0);
  });
});

// --- comparison ------------------------------------------------------------
describe("compareAllocations", () => {
  it("computes deltas between current and alternative", () => {
    // Alternative: more balanced (50/50) -> lower HHI, different beta.
    const alt: PositionValue[] = [
      pos("TCS", "Information Technology", 50000, 0.5),
      pos("HDFCBANK", "Banking", 50000, 0.5),
    ];
    const cmp = compareAllocations(positions, alt, betas, {
      type: "market_decline",
      marketShockPct: -10,
    });
    expect(cmp.current.hhi).toBeGreaterThan(cmp.alternative.hhi); // 0.52 vs 0.5
    expect(cmp.delta.hhi).toBeLessThan(0);
    expect(cmp.delta.beta).not.toBeNull();
  });
});
