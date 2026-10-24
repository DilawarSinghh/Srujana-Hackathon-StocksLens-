import { describe, it, expect } from "vitest";
import {
  positionValues,
  computeConcentration,
} from "./concentration";
import { computePortfolioBeta } from "./beta";
import { computePortfolioVolatility } from "./volatility";
import { computeStress } from "./stress";
import type { HoldingWithData } from "./types";

function h(
  symbol: string,
  sector: string,
  qty: number,
  avg: number,
  price: number | null,
  beta: number | null,
): HoldingWithData {
  return {
    symbol,
    name: symbol,
    sector,
    quantity: qty,
    avgBuyPrice: avg,
    currentPrice: price,
    beta,
    piotroskiScore: null,
    altmanZone: null,
  };
}

describe("positionValues", () => {
  it("computes value, weight, and P&L", () => {
    const holdings = [
      h("A", "IT", 10, 100, 150, 1), // value 1500, cost 1000, pnl +500
      h("B", "IT", 5, 200, 100, 1), // value 500, cost 1000, pnl -500
    ];
    const { positions, totalValue } = positionValues(holdings);
    expect(totalValue).toBe(2000);
    const a = positions.find((p) => p.symbol === "A")!;
    expect(a.value).toBe(1500);
    expect(a.weight).toBeCloseTo(0.75, 6);
    expect(a.pnl).toBe(500);
    expect(a.pnlPct).toBeCloseTo(50, 6);
    const b = positions.find((p) => p.symbol === "B")!;
    expect(b.pnl).toBe(-500);
  });

  it("excludes unpriced holdings from the value base", () => {
    const { positions, totalValue } = positionValues([
      h("A", "IT", 10, 100, 150, 1),
      h("B", "IT", 5, 200, null, 1),
    ]);
    expect(totalValue).toBe(1500);
    expect(positions.find((p) => p.symbol === "B")!.weight).toBeNull();
    expect(positions.find((p) => p.symbol === "A")!.weight).toBeCloseTo(1, 6);
  });
});

describe("computeConcentration", () => {
  it("flags sector > 40% and single stock > 25%", () => {
    const { positions } = positionValues([
      h("A", "IT", 60, 1, 1, 1), // 60%
      h("B", "Auto", 20, 1, 1, 1),
      h("C", "FMCG", 20, 1, 1, 1),
    ]);
    const c = computeConcentration(positions);
    expect(c.topSector?.sector).toBe("IT");
    expect(c.topSector?.weight).toBeCloseTo(0.6, 6);
    // Both a sector (>40%) and a single stock (>25%) flag should fire.
    expect(c.flags.length).toBe(2);
    expect(c.hhi).toBeGreaterThan(0);
  });

  it("no flags for a diversified book", () => {
    const { positions } = positionValues([
      h("A", "IT", 20, 1, 1, 1),
      h("B", "Auto", 20, 1, 1, 1),
      h("C", "FMCG", 20, 1, 1, 1),
      h("D", "Pharma", 20, 1, 1, 1),
      h("E", "Energy", 20, 1, 1, 1),
    ]);
    const c = computeConcentration(positions);
    expect(c.flags).toEqual([]);
    expect(c.hhi).toBeCloseTo(0.2, 6); // 5 equal weights -> 5 * 0.2^2
  });
});

describe("computePortfolioBeta", () => {
  it("weighted beta, skipping nulls and reporting covered weight", () => {
    const { positions } = positionValues([
      h("A", "IT", 50, 1, 1, 1.2), // weight 0.5, beta 1.2
      h("B", "Auto", 50, 1, 1, null), // weight 0.5, beta unknown
    ]);
    const betas = new Map([
      ["A", 1.2],
      ["B", null],
    ]);
    const r = computePortfolioBeta(positions, betas);
    // Only A is covered -> beta = 1.2, coveredWeight = 0.5
    expect(r.beta).toBeCloseTo(1.2, 6);
    expect(r.coveredWeight).toBeCloseTo(0.5, 6);
  });

  it("blends two betas by weight", () => {
    const { positions } = positionValues([
      h("A", "IT", 75, 1, 1, 2),
      h("B", "Auto", 25, 1, 1, 0),
    ]);
    const r = computePortfolioBeta(
      positions,
      new Map([
        ["A", 2],
        ["B", 0],
      ]),
    );
    expect(r.beta).toBeCloseTo(1.5, 6); // 0.75*2 + 0.25*0
    expect(r.coveredWeight).toBeCloseTo(1, 6);
  });

  it("null when no holding has a beta", () => {
    const { positions } = positionValues([h("A", "IT", 1, 1, 1, null)]);
    const r = computePortfolioBeta(positions, new Map([["A", null]]));
    expect(r.beta).toBeNull();
    expect(r.coveredWeight).toBe(0);
  });
});

describe("computePortfolioVolatility", () => {
  function series(n: number, f: (i: number) => number): Map<string, number> {
    const m = new Map<string, number>();
    for (let i = 0; i < n; i++) m.set(`d${i}`, f(i));
    return m;
  }

  it("null with insufficient overlap (<60 days)", () => {
    const weights = new Map([["A", 1]]);
    const returns = new Map([["A", series(30, () => 0.01)]]);
    const r = computePortfolioVolatility(weights, returns);
    expect(r.volatility).toBeNull();
    expect(r.reason).toBe("insufficient_history");
  });

  it("single asset volatility ~ annualised stdev", () => {
    // Alternating +1%/-1% returns -> stdev ~ 0.01
    const weights = new Map([["A", 1]]);
    const returns = new Map([
      ["A", series(100, (i) => (i % 2 === 0 ? 0.01 : -0.01))],
    ]);
    const r = computePortfolioVolatility(weights, returns);
    expect(r.reason).toBe("ok");
    // daily stdev ~0.01005 -> annualised ~0.1596
    expect(r.volatility).toBeGreaterThan(0.1);
    expect(r.volatility).toBeLessThan(0.2);
  });

  it("diversification: two anti-correlated assets lower combined vol", () => {
    const a = series(100, (i) => (i % 2 === 0 ? 0.01 : -0.01));
    const b = series(100, (i) => (i % 2 === 0 ? -0.01 : 0.01)); // opposite
    const weights = new Map([
      ["A", 0.5],
      ["B", 0.5],
    ]);
    const returns = new Map([
      ["A", a],
      ["B", b],
    ]);
    const r = computePortfolioVolatility(weights, returns);
    // Perfectly anti-correlated equal weights -> ~0 volatility
    expect(r.volatility).toBeLessThan(0.02);
  });
});

describe("computeStress", () => {
  it("loss = Σ weight-value × beta × shock", () => {
    const { positions } = positionValues([
      h("A", "IT", 1, 1, 1000, 1.5), // value 1000, beta 1.5
      h("B", "Auto", 1, 1, 1000, 0.5), // value 1000, beta 0.5
    ]);
    const betas = new Map([
      ["A", 1.5],
      ["B", 0.5],
    ]);
    const r = computeStress(positions, betas, -10);
    // A: 1000*1.5*-0.1 = -150 ; B: 1000*0.5*-0.1 = -50 ; total -200
    expect(r.estimatedLoss).toBeCloseTo(-200, 6);
    expect(r.totalValue).toBe(2000);
    expect(r.estimatedLossPct).toBeCloseTo(-10, 6); // -200/2000
  });

  it("null beta assumed as 1 and flagged", () => {
    const { positions } = positionValues([h("A", "IT", 1, 1, 1000, null)]);
    const r = computeStress(positions, new Map([["A", null]]), -20);
    const imp = r.perHolding[0];
    expect(imp.betaAssumed).toBe(true);
    expect(imp.beta).toBe(1);
    expect(imp.estimatedLoss).toBeCloseTo(-200, 6); // 1000*1*-0.2
  });
});
