import { describe, it, expect } from "vitest";
import {
  computePiotroski,
  computeAltmanZDoublePrime,
  computeDividend,
  altmanZonePoints,
  type QualityFundamentals,
} from "./quality";

/** A fully-populated, improving-year fundamentals pair. */
function baseYear(overrides: Partial<QualityFundamentals> = {}): QualityFundamentals {
  return {
    revenue: 1000,
    net_profit: 120,
    operating_cash_flow: 150,
    total_assets: 2000,
    current_assets: 800,
    current_liabilities: 400,
    long_term_debt: 300,
    total_liabilities: 900,
    retained_earnings: 600,
    total_equity: 1100,
    ebit: 200,
    gross_profit: 400,
    dividends_paid: -40,
    shares_outstanding: 100,
    ...overrides,
  };
}

describe("Piotroski F-Score", () => {
  it("awards all 9 points for a uniformly improving company", () => {
    const prior = baseYear({
      net_profit: 60, // lower ROA last year
      operating_cash_flow: 80,
      total_assets: 2000,
      current_assets: 600, // lower current ratio last year
      current_liabilities: 400,
      long_term_debt: 500, // higher debt ratio last year
      gross_profit: 300, // lower margin last year (0.30 vs 0.40)
      revenue: 900, // lower asset turnover last year (0.45 vs 0.50)
      shares_outstanding: 100, // same shares -> no dilution passes
    });
    const current = baseYear();
    const r = computePiotroski(current, prior);
    expect(r.availableCriteria).toBe(9);
    expect(r.score).toBe(9);
    expect(r.criteria.every((c) => c.passed === true)).toBe(true);
  });

  it("checks each criterion individually (ROA positive)", () => {
    const current = baseYear({ net_profit: -10 });
    const prior = baseYear({ net_profit: -20 });
    const r = computePiotroski(current, prior);
    const roa = r.criteria.find((c) => c.label.startsWith("Return on assets is"));
    expect(roa?.passed).toBe(false);
  });

  it("fails OCF-positive and cash-flow-exceeds-profit when OCF is negative", () => {
    const current = baseYear({ operating_cash_flow: -5 });
    const prior = baseYear();
    const r = computePiotroski(current, prior);
    expect(r.criteria[1].passed).toBe(false); // OCF > 0
    expect(r.criteria[3].passed).toBe(false); // OCF > net income
  });

  it("detects dilution (shares increased) as a fail", () => {
    const current = baseYear({ shares_outstanding: 110 });
    const prior = baseYear({ shares_outstanding: 100 });
    const r = computePiotroski(current, prior);
    const dil = r.criteria.find((c) => c.label.startsWith("No dilution"));
    expect(dil?.passed).toBe(false);
  });

  it("skips (does not zero) a criterion with missing data", () => {
    // Remove gross_profit both years -> gross margin criterion unevaluable.
    const current = baseYear({ gross_profit: null });
    const prior = baseYear({ gross_profit: null });
    const r = computePiotroski(current, prior);
    const gm = r.criteria.find((c) => c.label.startsWith("Gross margin"));
    expect(gm?.passed).toBeNull();
    expect(r.availableCriteria).toBe(8);
    expect(r.score).not.toBeNull(); // still >= 6 available
  });

  it("returns null score when fewer than 6 criteria are available", () => {
    const sparse: QualityFundamentals = {
      revenue: null,
      net_profit: 100,
      operating_cash_flow: 120,
      total_assets: null,
      current_assets: null,
      current_liabilities: null,
      long_term_debt: null,
      total_liabilities: null,
      retained_earnings: null,
      total_equity: null,
      ebit: null,
      gross_profit: null,
      dividends_paid: null,
      shares_outstanding: 100,
    };
    const r = computePiotroski(sparse, sparse);
    expect(r.availableCriteria).toBeLessThan(6);
    expect(r.score).toBeNull();
  });
});

describe("Altman Z''-Score", () => {
  it("computes the emerging-market formula", () => {
    const f = baseYear();
    // X1=(800-400)/2000=0.2, X2=600/2000=0.3, X3=200/2000=0.1, X4=1100/900=1.2222
    // Z=6.56*0.2+3.26*0.3+6.72*0.1+1.05*1.2222 = 1.312+0.978+0.672+1.2833=4.2453
    const r = computeAltmanZDoublePrime(f, false);
    expect(r.z).toBeCloseTo(4.25, 1);
    expect(r.zone).toBe("safe");
  });

  it("classifies the grey zone (1.1 to 2.6)", () => {
    // Tune retained earnings and equity down to land in grey.
    const f = baseYear({ retained_earnings: 100, total_equity: 300, ebit: 60 });
    const r = computeAltmanZDoublePrime(f, false);
    expect(r.z).not.toBeNull();
    expect(r.zone).toBe("grey");
  });

  it("classifies distress below 1.1", () => {
    const f = baseYear({
      current_assets: 100,
      current_liabilities: 700,
      retained_earnings: -200,
      ebit: -50,
      total_equity: 50,
      total_liabilities: 1800,
    });
    const r = computeAltmanZDoublePrime(f, false);
    expect(r.zone).toBe("distress");
  });

  it("boundary: exactly 2.6 is grey, just above is safe", () => {
    // Build X-values so Z == 2.6 using only X2 (RE/TA): 3.26 * x2 = 2.6 => x2 ≈ 0.7975
    const f = baseYear({
      current_assets: 400,
      current_liabilities: 400, // X1 = 0
      retained_earnings: 1595, // /2000 = 0.7975 -> 3.26*0.7975 ≈ 2.6
      ebit: 0, // X3 = 0
      total_equity: 0, // X4 = 0
      total_liabilities: 900,
    });
    const r = computeAltmanZDoublePrime(f, false);
    expect(r.z).toBeCloseTo(2.6, 1);
    expect(r.zone).toBe("grey"); // 2.6 is NOT > 2.6
  });

  it("is not_applicable for banks/NBFCs", () => {
    const r = computeAltmanZDoublePrime(baseYear(), true);
    expect(r.z).toBeNull();
    expect(r.zone).toBe("not_applicable");
  });

  it("returns null when an input is missing", () => {
    const r = computeAltmanZDoublePrime(baseYear({ total_assets: null }), false);
    expect(r.z).toBeNull();
  });

  it("returns null when total liabilities are zero", () => {
    const r = computeAltmanZDoublePrime(baseYear({ total_liabilities: 0 }), false);
    expect(r.z).toBeNull();
  });
});

describe("dividend payout & safety", () => {
  it("computes payout from the magnitude of a negative cash outflow", () => {
    const r = computeDividend(-40, 120);
    expect(r.payoutRatio).toBeCloseTo(0.3333, 4);
    expect(r.safety).toBe("strong");
  });

  it("strong boundary at 60%", () => {
    expect(computeDividend(-60, 100).safety).toBe("strong");
  });

  it("moderate between 60% and 90%", () => {
    expect(computeDividend(-75, 100).safety).toBe("moderate");
    expect(computeDividend(-90, 100).safety).toBe("moderate");
  });

  it("weak above 90%", () => {
    expect(computeDividend(-95, 100).safety).toBe("weak");
  });

  it("not_available when net profit is not positive", () => {
    expect(computeDividend(-40, 0).safety).toBe("not_available");
    expect(computeDividend(-40, -10).safety).toBe("not_available");
  });

  it("not_available when inputs are missing", () => {
    expect(computeDividend(null, 100).payoutRatio).toBeNull();
    expect(computeDividend(-40, null).safety).toBe("not_available");
  });
});

describe("altmanZonePoints", () => {
  it("maps zones to pillar points", () => {
    expect(altmanZonePoints("safe")).toBe(100);
    expect(altmanZonePoints("grey")).toBe(50);
    expect(altmanZonePoints("distress")).toBe(10);
    expect(altmanZonePoints("not_applicable")).toBeNull();
    expect(altmanZonePoints(null)).toBeNull();
  });
});
