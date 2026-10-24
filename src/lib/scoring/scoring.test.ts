import { describe, it, expect } from "vitest";
import { percentileRank } from "./percentile";
import { scoreGovernance } from "./governance";
import { evaluateRedFlags } from "./red-flags";
import {
  scoreGroup,
  labelFor,
  cappedOcfRatio,
  type StockForScoring,
  type ScoringMetrics,
} from "./score";
import {
  PILLAR_WEIGHTS,
  LABELS,
  type PillarKey,
} from "./constants";

// ---------------------------------------------------------------------------
// weights
// ---------------------------------------------------------------------------
describe("pillar weights", () => {
  it("sum to 100", () => {
    const sum = (Object.keys(PILLAR_WEIGHTS) as PillarKey[]).reduce(
      (a, p) => a + PILLAR_WEIGHTS[p],
      0,
    );
    expect(sum).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// percentile + direction flip
// ---------------------------------------------------------------------------
describe("percentileRank", () => {
  const peers = [10, 20, 30, 40, 50];

  it("ranks higher values higher for 'high' direction", () => {
    expect(percentileRank(50, peers, "high")).toBeGreaterThan(
      percentileRank(10, peers, "high")!,
    );
  });

  it("median maps near 50", () => {
    expect(percentileRank(30, peers, "high")).toBeCloseTo(50, 5);
  });

  it("flips for 'low' direction (lower raw = higher score)", () => {
    const low = percentileRank(10, peers, "low")!;
    const high = percentileRank(50, peers, "low")!;
    expect(low).toBeGreaterThan(high);
    // low+high around a flip should sum to ~100 for symmetric positions
    expect(percentileRank(10, peers, "high")! + percentileRank(10, peers, "low")!).toBeCloseTo(100, 5);
  });

  it("null when no peers or value not finite", () => {
    expect(percentileRank(10, [], "high")).toBeNull();
    expect(percentileRank(NaN, peers, "high")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// governance
// ---------------------------------------------------------------------------
describe("scoreGovernance", () => {
  it("averages available sub-scores; skips unknown", () => {
    // pledge 0 -> 100; auditor unqualified -> 100; rpt unknown skip; change null skip
    const s = scoreGovernance({
      promoter_pledge_pct: 0,
      promoter_holding_change_1y: null,
      auditor_opinion: "unqualified",
      related_party_trend: "unknown",
    });
    expect(s).toBe(100);
  });

  it("pledge thresholds", () => {
    const mk = (p: number) =>
      scoreGovernance({
        promoter_pledge_pct: p,
        promoter_holding_change_1y: null,
        auditor_opinion: "unknown",
        related_party_trend: "unknown",
      });
    expect(mk(0)).toBe(100);
    expect(mk(5)).toBe(80);
    expect(mk(10)).toBe(80);
    expect(mk(25)).toBe(40);
    expect(mk(40)).toBe(0);
  });

  it("promoter holding change rule (worse than -5 = 30)", () => {
    const mk = (c: number) =>
      scoreGovernance({
        promoter_pledge_pct: null,
        promoter_holding_change_1y: c,
        auditor_opinion: "unknown",
        related_party_trend: "unknown",
      });
    expect(mk(-6)).toBe(30);
    expect(mk(-5)).toBe(100); // -5 is not worse than -5
    expect(mk(2)).toBe(100);
  });

  it("null when nothing available", () => {
    expect(
      scoreGovernance({
        promoter_pledge_pct: null,
        promoter_holding_change_1y: null,
        auditor_opinion: "unknown",
        related_party_trend: "unknown",
      }),
    ).toBeNull();
    expect(scoreGovernance(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// red flags
// ---------------------------------------------------------------------------
describe("evaluateRedFlags", () => {
  const noGov = {
    promoter_pledge_pct: null,
    promoter_holding_change_1y: null,
    auditor_opinion: "unknown" as const,
    related_party_trend: "unknown" as const,
  };

  it("no flags when data clean/absent", () => {
    expect(evaluateRedFlags({ governance: noGov, recentOcf: [100, 120, 140] })).toEqual([]);
    expect(evaluateRedFlags({ governance: null, recentOcf: [] })).toEqual([]);
  });

  it("pledge > 30 triggers", () => {
    const f = evaluateRedFlags({
      governance: { ...noGov, promoter_pledge_pct: 45 },
      recentOcf: [],
    });
    expect(f.map((x) => x.code)).toContain("PLEDGE_HIGH");
  });

  it("3 consecutive negative OCF years triggers", () => {
    const f = evaluateRedFlags({ governance: noGov, recentOcf: [-10, -5, -2] });
    expect(f.map((x) => x.code)).toContain("NEG_OCF_3Y");
  });
  it("does NOT trigger if only 2 negative or a positive present", () => {
    expect(
      evaluateRedFlags({ governance: noGov, recentOcf: [10, -5, -2] }).map((x) => x.code),
    ).not.toContain("NEG_OCF_3Y");
    expect(
      evaluateRedFlags({ governance: noGov, recentOcf: [-5, -2] }).map((x) => x.code),
    ).not.toContain("NEG_OCF_3Y");
  });

  it("adverse auditor triggers", () => {
    for (const op of ["qualified", "adverse", "disclaimer"] as const) {
      const f = evaluateRedFlags({
        governance: { ...noGov, auditor_opinion: op },
        recentOcf: [],
      });
      expect(f.map((x) => x.code)).toContain("AUDITOR_FLAG");
    }
  });

  it("sharply rising related party triggers", () => {
    const f = evaluateRedFlags({
      governance: { ...noGov, related_party_trend: "sharply_rising" },
      recentOcf: [],
    });
    expect(f.map((x) => x.code)).toContain("RPT_SPIKE");
  });
});

// ---------------------------------------------------------------------------
// labels
// ---------------------------------------------------------------------------
describe("labelFor", () => {
  it("thresholds with good confidence", () => {
    expect(labelFor(85, 1)).toBe(LABELS.strong);
    expect(labelFor(70, 1)).toBe(LABELS.strong);
    expect(labelFor(69.9, 1)).toBe(LABELS.average);
    expect(labelFor(40, 1)).toBe(LABELS.average);
    expect(labelFor(39.9, 1)).toBe(LABELS.weak);
  });
  it("limited data overrides", () => {
    expect(labelFor(90, 0.5)).toBe(LABELS.limited);
  });
});

// ---------------------------------------------------------------------------
// cappedOcfRatio
// ---------------------------------------------------------------------------
describe("cappedOcfRatio", () => {
  it("caps at 1.5", () => {
    expect(cappedOcfRatio(300, 100)).toBe(1.5);
    expect(cappedOcfRatio(120, 100)).toBeCloseTo(1.2, 6);
  });
  it("null when net profit is zero/null", () => {
    expect(cappedOcfRatio(100, 0)).toBeNull();
    expect(cappedOcfRatio(100, null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// integration: scoreGroup — bank handling, renormalization, small-peer, caps
// ---------------------------------------------------------------------------

function baseMetrics(over: Partial<ScoringMetrics> = {}): ScoringMetrics {
  return {
    roe: 0.15,
    roce: 0.18,
    operating_margin: 0.2,
    revenue_cagr_3y: 0.1,
    revenue_cagr_5y: 0.12,
    profit_cagr_3y: 0.1,
    profit_cagr_5y: 0.11,
    debt_to_equity: 0.5,
    interest_coverage: 8,
    ocf_to_net_profit: 1.1,
    pe_rel_sector: 1.0,
    peg: 1.2,
    volatility_1y: 0.25,
    max_drawdown_3y: -0.3,
    ...over,
  };
}

function mkStock(
  id: string,
  sector: string,
  over: Partial<ScoringMetrics> = {},
  extra: Partial<StockForScoring> = {},
): StockForScoring {
  return {
    stock_id: id,
    symbol: id,
    sector,
    metrics: baseMetrics(over),
    growthPillarPositive: true,
    governance: {
      promoter_pledge_pct: 0,
      promoter_holding_change_1y: 0,
      auditor_opinion: "unqualified",
      related_party_trend: "stable",
    },
    recentOcf: [100, 120, 140],
    ...extra,
  };
}

describe("scoreGroup integration", () => {
  it("produces scores in [0,100] and ranks a stronger stock higher", () => {
    const group = [
      mkStock("A", "IT", { roe: 0.3, roce: 0.35, operating_margin: 0.4 }),
      mkStock("B", "IT", { roe: 0.05, roce: 0.06, operating_margin: 0.05 }),
      mkStock("C", "IT"),
      mkStock("D", "IT"),
    ];
    const results = scoreGroup(group, group);
    const byId = Object.fromEntries(results.map((r) => [r.stock_id, r]));
    for (const r of results) {
      expect(r.total_score).toBeGreaterThanOrEqual(0);
      expect(r.total_score).toBeLessThanOrEqual(100);
    }
    expect(byId["A"].total_score).toBeGreaterThan(byId["B"].total_score);
  });

  it("banks skip D/E and OCF metrics (financial_health from coverage only)", () => {
    const banks = [
      mkStock("BK1", "Banking", { interest_coverage: 20 }),
      mkStock("BK2", "Banking", { interest_coverage: 2 }),
      mkStock("BK3", "Banking", { interest_coverage: 10 }),
      mkStock("BK4", "Banking", { interest_coverage: 5 }),
    ];
    const results = scoreGroup(banks, banks);
    // financial_health pillar should still be present (from interest coverage)
    for (const r of results) {
      expect(r.financial_health).not.toBeNull();
    }
    // Explanations for financial_health should not mention Debt / Equity.
    const bk1 = results.find((r) => r.stock_id === "BK1")!;
    const fhText = (bk1.explanations.financial_health ?? []).join(" ");
    expect(fhText).not.toContain("Debt / Equity");
  });

  it("renormalizes when a whole pillar is missing", () => {
    // Make governance unavailable and growth all-null -> those weights redistribute.
    const g = [
      mkStock("X", "Auto", { revenue_cagr_3y: null, revenue_cagr_5y: null, profit_cagr_3y: null, profit_cagr_5y: null }, {
        governance: null,
        growthPillarPositive: false,
      }),
      mkStock("Y", "Auto", {}, { governance: null }),
      mkStock("Z", "Auto", {}, { governance: null }),
      mkStock("W", "Auto", {}, { governance: null }),
    ];
    const results = scoreGroup(g, g);
    const x = results.find((r) => r.stock_id === "X")!;
    expect(x.growth).toBeNull(); // whole growth pillar missing for X
    expect(x.total_score).toBeGreaterThanOrEqual(0);
    expect(x.total_score).toBeLessThanOrEqual(100);
    // data_confidence reduced because metrics are missing
    expect(x.data_confidence).toBeLessThan(1);
  });

  it("small peer group falls back to universe and flags low_peer_count", () => {
    // Only 2 stocks in the sector -> fewer than MIN_PEERS (4).
    const sector = [mkStock("S1", "Telecom"), mkStock("S2", "Telecom")];
    const universe = [
      ...sector,
      mkStock("U1", "IT"),
      mkStock("U2", "IT"),
      mkStock("U3", "IT"),
      mkStock("U4", "Auto"),
    ];
    const results = scoreGroup(sector, universe);
    expect(results.every((r) => r.low_peer_count)).toBe(true);
  });

  it("red-flag cap limits total to 40 with explanation", () => {
    const group = [
      mkStock("F1", "IT", { roe: 0.5, roce: 0.6, operating_margin: 0.5 }, {
        governance: {
          promoter_pledge_pct: 55, // > 30 triggers cap
          promoter_holding_change_1y: 0,
          auditor_opinion: "unqualified",
          related_party_trend: "stable",
        },
      }),
      mkStock("F2", "IT"),
      mkStock("F3", "IT"),
      mkStock("F4", "IT"),
    ];
    const results = scoreGroup(group, group);
    const f1 = results.find((r) => r.stock_id === "F1")!;
    expect(f1.capped).toBe(true);
    expect(f1.total_score).toBeLessThanOrEqual(40);
    expect(f1.red_flags.map((x) => x.code)).toContain("PLEDGE_HIGH");
  });

  it("each red-flag type triggers the cap", () => {
    const scenarios: Array<[string, Partial<StockForScoring>]> = [
      ["AUDITOR_FLAG", { governance: { promoter_pledge_pct: 0, promoter_holding_change_1y: 0, auditor_opinion: "qualified", related_party_trend: "stable" } }],
      ["RPT_SPIKE", { governance: { promoter_pledge_pct: 0, promoter_holding_change_1y: 0, auditor_opinion: "unqualified", related_party_trend: "sharply_rising" } }],
      ["NEG_OCF_3Y", { recentOcf: [-5, -6, -7] }],
    ];
    for (const [code, extra] of scenarios) {
      const group = [
        mkStock("T1", "IT", { roe: 0.5, roce: 0.6, operating_margin: 0.5 }, extra),
        mkStock("T2", "IT"),
        mkStock("T3", "IT"),
        mkStock("T4", "IT"),
      ];
      const r = scoreGroup(group, group).find((x) => x.stock_id === "T1")!;
      expect(r.red_flags.map((x) => x.code)).toContain(code);
      expect(r.total_score).toBeLessThanOrEqual(40);
      expect(r.capped).toBe(true);
    }
  });
});
