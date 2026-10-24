import { describe, it, expect } from "vitest";
import {
  computeRoe,
  computeRoce,
  computeOperatingMargin,
  computeDebtToEquity,
  computeInterestCoverage,
  computeCagr,
  computeCagrFromSeries,
  computePeg,
  logReturns,
  stdev,
  computeVolatility1y,
  computeMaxDrawdown,
  computeBeta,
  alignReturns,
  dailyReturnMap,
  compute52Week,
} from "./metrics";

describe("ratios", () => {
  it("ROE divides net profit by equity", () => {
    expect(computeRoe(180, 1000)).toBeCloseTo(0.18, 6);
  });
  it("returns null on zero/negative or null divisor", () => {
    expect(computeRoe(180, 0)).toBeNull();
    expect(computeRoe(null, 1000)).toBeNull();
    expect(computeRoe(180, null)).toBeNull();
  });

  it("ROCE uses assets - current liabilities", () => {
    // ebit 200 / (2000 - 500) = 0.1333...
    expect(computeRoce(200, 2000, 500, null, null)).toBeCloseTo(200 / 1500, 6);
  });
  it("ROCE falls back to equity + debt when primary denom non-positive", () => {
    // assets - CL = 0 -> fallback to equity+debt = 1000
    expect(computeRoce(200, 500, 500, 600, 400)).toBeCloseTo(0.2, 6);
  });
  it("ROCE null when ebit missing", () => {
    expect(computeRoce(null, 2000, 500, 600, 400)).toBeNull();
  });

  it("operating margin", () => {
    expect(computeOperatingMargin(250, 1000)).toBeCloseTo(0.25, 6);
    expect(computeOperatingMargin(250, 0)).toBeNull();
  });

  it("debt/equity", () => {
    expect(computeDebtToEquity(400, 1000)).toBeCloseTo(0.4, 6);
    expect(computeDebtToEquity(400, null)).toBeNull();
  });

  it("interest coverage", () => {
    expect(computeInterestCoverage(500, 50)).toBeCloseTo(10, 6);
    expect(computeInterestCoverage(500, 0)).toBeNull();
  });
});

describe("CAGR", () => {
  it("computes compound growth", () => {
    // 100 -> 200 over 3 years = 2^(1/3) - 1 ≈ 0.2599
    expect(computeCagr(100, 200, 3)).toBeCloseTo(0.259921, 5);
  });
  it("null when base is zero or negative", () => {
    expect(computeCagr(0, 200, 3)).toBeNull();
    expect(computeCagr(-50, 200, 3)).toBeNull();
  });
  it("null when end value is non-positive", () => {
    expect(computeCagr(100, -10, 3)).toBeNull();
    expect(computeCagr(100, 0, 3)).toBeNull();
  });
  it("null when years <= 0 or inputs missing", () => {
    expect(computeCagr(100, 200, 0)).toBeNull();
    expect(computeCagr(null, 200, 3)).toBeNull();
    expect(computeCagr(100, null, 3)).toBeNull();
  });

  it("from series picks the right endpoints", () => {
    // 5 years of data; 3y CAGR uses index [-4] -> [-1]
    const rev = [100, 120, 150, 180, 240]; // oldest -> newest
    // 3y: 120 -> 240 over 3 = 2^(1/3)-1
    expect(computeCagrFromSeries(rev, 3)).toBeCloseTo(0.259921, 5);
  });
  it("from series null when not enough points", () => {
    expect(computeCagrFromSeries([100, 120], 3)).toBeNull();
  });
  it("from series null on a gap in required endpoints", () => {
    expect(computeCagrFromSeries([null, 120, 150, 180], 3)).toBeNull();
  });
});

describe("PEG", () => {
  it("pe / (cagr*100) only when growth > 0", () => {
    // pe 30, cagr 0.15 -> 30 / 15 = 2
    expect(computePeg(30, 0.15)).toBeCloseTo(2, 6);
  });
  it("null when growth <= 0 or missing", () => {
    expect(computePeg(30, 0)).toBeNull();
    expect(computePeg(30, -0.1)).toBeNull();
    expect(computePeg(null, 0.15)).toBeNull();
    expect(computePeg(30, null)).toBeNull();
  });
});

describe("price-series metrics", () => {
  it("log returns skip non-positive prices", () => {
    const r = logReturns([100, 110, 0, 120]);
    // only 100->110 is valid (0 breaks the next two)
    expect(r.length).toBe(1);
    expect(r[0]).toBeCloseTo(Math.log(1.1), 6);
  });

  it("stdev sample", () => {
    expect(stdev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
    expect(stdev([5])).toBeNull();
  });

  it("volatility annualizes", () => {
    // flat series -> zero volatility
    const closes = Array.from({ length: 260 }, () => 100);
    expect(computeVolatility1y(closes)).toBe(0);
  });
  it("volatility null on insufficient data", () => {
    expect(computeVolatility1y([100])).toBeNull();
  });

  it("max drawdown is the worst peak-to-trough", () => {
    // 100 -> 120 -> 60 -> 90 : worst is 60/120 - 1 = -0.5
    expect(computeMaxDrawdown([100, 120, 60, 90])).toBeCloseTo(-0.5, 6);
  });
  it("max drawdown zero when monotonic up", () => {
    expect(computeMaxDrawdown([100, 110, 120])).toBe(0);
  });
  it("max drawdown null on insufficient data", () => {
    expect(computeMaxDrawdown([100])).toBeNull();
  });

  it("beta ~1 when stock equals market", () => {
    const m = [0.01, -0.02, 0.015, -0.005, 0.02];
    expect(computeBeta(m, m)).toBeCloseTo(1, 6);
  });
  it("beta ~2 when stock is 2x market", () => {
    const m = [0.01, -0.02, 0.015, -0.005, 0.02];
    const s = m.map((x) => 2 * x);
    expect(computeBeta(s, m)).toBeCloseTo(2, 6);
  });
  it("beta null when market variance is zero or too few points", () => {
    expect(computeBeta([0.01, 0.02], [0, 0])).toBeNull();
    expect(computeBeta([0.01], [0.01])).toBeNull();
  });

  it("alignReturns intersects common dates in order", () => {
    const s = new Map([
      ["2024-01-02", 0.01],
      ["2024-01-03", -0.02],
      ["2024-01-04", 0.03],
    ]);
    const m = new Map([
      ["2024-01-03", -0.01],
      ["2024-01-04", 0.02],
      ["2024-01-05", 0.0],
    ]);
    const a = alignReturns(s, m);
    expect(a.stock).toEqual([-0.02, 0.03]);
    expect(a.market).toEqual([-0.01, 0.02]);
  });

  it("dailyReturnMap keys by date and skips bad prices", () => {
    const map = dailyReturnMap([
      { date: "d1", close: 100 },
      { date: "d2", close: 110 },
      { date: "d3", close: null },
      { date: "d4", close: 121 },
    ]);
    expect(map.has("d2")).toBe(true);
    expect(map.has("d3")).toBe(false); // null close
    expect(map.has("d4")).toBe(false); // prev close was null
    expect(map.get("d2")).toBeCloseTo(Math.log(1.1), 6);
  });

  it("52-week high/low from recent closes", () => {
    const closes = [50, 10, 100, 70];
    const { high, low } = compute52Week(closes);
    expect(high).toBe(100);
    expect(low).toBe(10);
  });
  it("52-week null on empty series", () => {
    expect(compute52Week([])).toEqual({ high: null, low: null });
  });
});
