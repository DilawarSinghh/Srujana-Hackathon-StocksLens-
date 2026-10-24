import { describe, it, expect } from "vitest";
import { buildPortfolioRiskData } from "./explain-context";
import type { PositionValue } from "./types";
import type { ConcentrationResult } from "./concentration";
import type { PortfolioBeta } from "./beta";
import type { VolatilityResult } from "./volatility";
import type {
  CorrelationResult,
  VolContributionResult,
} from "./correlation";

function pos(symbol: string, sector: string | null, weight: number | null): PositionValue {
  return {
    symbol,
    name: symbol,
    sector,
    quantity: 1,
    avgBuyPrice: 100,
    currentPrice: 100,
    value: weight != null ? weight * 1000 : null,
    weight,
    pnl: 0,
    pnlPct: 0,
  };
}

describe("buildPortfolioRiskData", () => {
  const positions = [pos("A", "IT", 0.6), pos("B", "Banking", 0.4)];
  const concentration: ConcentrationResult = {
    sectorWeights: [
      { sector: "IT", weight: 0.6 },
      { sector: "Banking", weight: 0.4 },
    ],
    hhi: 0.52,
    flags: ["High concentration: 60% in IT."],
    topSector: { sector: "IT", weight: 0.6 },
    topStock: { symbol: "A", weight: 0.6 },
  };
  const beta: PortfolioBeta = { beta: 1.123, coveredWeight: 1 };
  const correlation: CorrelationResult = {
    symbols: ["A", "B"],
    matrix: [
      [1, 0.42],
      [0.42, 1],
    ],
    pairs: [{ a: "A", b: "B", value: 0.42, overlapDays: 200 }],
    averageCorrelation: 0.42,
  };
  const volContrib: VolContributionResult = {
    contributions: [
      { symbol: "A", contribution: 0.7 },
      { symbol: "B", contribution: 0.3 },
    ],
    portfolioVolatility: 0.25,
    overlapDays: 200,
  };

  it("assembles computed numbers, rounded, with units in %", () => {
    const vol: VolatilityResult = { volatility: 0.253, reason: "ok", overlapDays: 200 };
    const data = buildPortfolioRiskData({
      positions,
      totalValue: 1000,
      concentration,
      beta,
      volatility: vol,
      correlation,
      volContrib,
    });

    expect(data.holdingCount).toBe(2);
    expect(data.beta.value).toBe(1.12);
    expect(data.beta.coveredWeightPct).toBe(100);
    expect(data.volatility.annualisedPct).toBe(25.3);
    expect(data.volatility.note).toBeNull();
    expect(data.concentration.topSector).toBe("IT");
    expect(data.concentration.topSectorWeightPct).toBe(60);
    expect(data.correlation.averagePairwise).toBe(0.42);
    expect(data.correlation.highestPair).toEqual({ a: "A", b: "B", value: 0.42 });
    const a = data.holdings.find((h) => h.symbol === "A");
    expect(a?.weightPct).toBe(60);
    expect(a?.volContributionPct).toBe(70);
  });

  it("never invents numbers: reports unavailable volatility with a reason", () => {
    const vol: VolatilityResult = {
      volatility: null,
      reason: "insufficient_history",
      overlapDays: 12,
    };
    const data = buildPortfolioRiskData({
      positions,
      totalValue: 1000,
      concentration,
      beta,
      volatility: vol,
      correlation,
      volContrib,
    });
    expect(data.volatility.annualisedPct).toBeNull();
    expect(data.volatility.note).toContain("Not available");
    expect(data.volatility.note).toContain("12");
  });
});
