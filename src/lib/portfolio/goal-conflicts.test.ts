import { describe, it, expect } from "vitest";
import {
  evaluateGoalConflicts,
  CONFLICT_THRESHOLDS,
  type PortfolioProfile,
  type PortfolioObservations,
} from "./goal-conflicts";

const baseObs: PortfolioObservations = {
  beta: 0.8,
  volatility: 0.15,
  smallCapWeight: 0,
  topSectorWeight: 0.2,
  topSectorName: "IT",
  illiquidWeight: 0,
};
const moderate: PortfolioProfile = {
  riskTolerance: "moderate",
  horizonYears: 10,
  liquidityNeedPct: 0,
};

function codes(p: PortfolioProfile, o: PortfolioObservations): string[] {
  return evaluateGoalConflicts(p, o).map((c) => c.code);
}

describe("goal conflicts", () => {
  it("no conflicts for a well-matched profile", () => {
    expect(evaluateGoalConflicts(moderate, baseObs)).toHaveLength(0);
  });

  it("short horizon + high beta fires", () => {
    const c = codes({ ...moderate, horizonYears: 2 }, { ...baseObs, beta: 1.2 });
    expect(c).toContain("SHORT_HORIZON_HIGH_BETA");
  });

  it("short horizon high-beta boundary: beta exactly 1.0 does NOT fire", () => {
    const c = codes({ ...moderate, horizonYears: 2 }, { ...baseObs, beta: CONFLICT_THRESHOLDS.highBeta });
    expect(c).not.toContain("SHORT_HORIZON_HIGH_BETA");
  });

  it("horizon exactly 3y does NOT fire short-horizon rules", () => {
    const c = codes({ ...moderate, horizonYears: 3 }, { ...baseObs, beta: 1.5, smallCapWeight: 0.5 });
    expect(c).not.toContain("SHORT_HORIZON_HIGH_BETA");
    expect(c).not.toContain("SHORT_HORIZON_SMALLCAP");
  });

  it("short horizon + heavy small-cap fires", () => {
    const c = codes({ ...moderate, horizonYears: 2 }, { ...baseObs, smallCapWeight: 0.4 });
    expect(c).toContain("SHORT_HORIZON_SMALLCAP");
  });

  it("small-cap boundary exactly 30% does NOT fire", () => {
    const c = codes(
      { ...moderate, horizonYears: 2 },
      { ...baseObs, smallCapWeight: CONFLICT_THRESHOLDS.smallCapWeightShortHorizon },
    );
    expect(c).not.toContain("SHORT_HORIZON_SMALLCAP");
  });

  it("high liquidity need + illiquid weight fires", () => {
    const c = codes({ ...moderate, liquidityNeedPct: 30 }, { ...baseObs, illiquidWeight: 0.5 });
    expect(c).toContain("LIQUIDITY_VS_ILLIQUID");
  });

  it("liquidity boundary exactly 20% does NOT fire", () => {
    const c = codes(
      { ...moderate, liquidityNeedPct: CONFLICT_THRESHOLDS.liquidityNeedPct },
      { ...baseObs, illiquidWeight: 0.5 },
    );
    expect(c).not.toContain("LIQUIDITY_VS_ILLIQUID");
  });

  it("conservative + high volatility fires", () => {
    const c = codes({ ...moderate, riskTolerance: "conservative" }, { ...baseObs, volatility: 0.4 });
    expect(c).toContain("CONSERVATIVE_HIGH_VOL");
  });

  it("conservative volatility boundary exactly 30% does NOT fire", () => {
    const c = codes(
      { ...moderate, riskTolerance: "conservative" },
      { ...baseObs, volatility: CONFLICT_THRESHOLDS.conservativeVolatility },
    );
    expect(c).not.toContain("CONSERVATIVE_HIGH_VOL");
  });

  it("conservative + concentrated sector fires", () => {
    const c = codes(
      { ...moderate, riskTolerance: "conservative" },
      { ...baseObs, topSectorWeight: 0.5, topSectorName: "Banking" },
    );
    expect(c).toContain("CONSERVATIVE_CONCENTRATED");
  });

  it("aggressive + short horizon fires", () => {
    const c = codes({ ...moderate, riskTolerance: "aggressive", horizonYears: 1 }, baseObs);
    expect(c).toContain("AGGRESSIVE_SHORT_HORIZON");
  });

  it("aggressive horizon exactly 2y does NOT fire", () => {
    const c = codes(
      { ...moderate, riskTolerance: "aggressive", horizonYears: CONFLICT_THRESHOLDS.aggressiveShortHorizonYears },
      baseObs,
    );
    expect(c).not.toContain("AGGRESSIVE_SHORT_HORIZON");
  });

  it("skips rules when metrics are null (no guessing)", () => {
    const c = codes({ ...moderate, horizonYears: 2 }, { ...baseObs, beta: null, volatility: null });
    expect(c).not.toContain("SHORT_HORIZON_HIGH_BETA");
  });

  it("warnings never contain advice verbs", () => {
    const all = evaluateGoalConflicts(
      { riskTolerance: "aggressive", horizonYears: 1, liquidityNeedPct: 50 },
      { beta: 1.5, volatility: 0.5, smallCapWeight: 0.5, topSectorWeight: 0.6, topSectorName: "IT", illiquidWeight: 0.6 },
    );
    for (const w of all) {
      expect(/\b(buy|sell|hold)\b/i.test(w.message)).toBe(false);
    }
  });
});
