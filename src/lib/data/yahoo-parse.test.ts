import { describe, it, expect } from "vitest";
import {
  parseChartJson,
  parseFundamentalsTimeseriesJson,
  FUNDAMENTALS_TIMESERIES_KEYS,
} from "./yahoo-parse";

/**
 * Fixtures mirror the real crumb-free Yahoo response shapes captured from the
 * live endpoints (v8 chart + fundamentals-timeseries) for RELIANCE.NS (INR).
 */

describe("parseChartJson", () => {
  const chartFixture = {
    chart: {
      result: [
        {
          meta: { currency: "INR", symbol: "RELIANCE.NS" },
          // 2024-01-01 and 2024-01-02 (UTC midnight timestamps).
          timestamp: [1704067200, 1704153600, 1704240000],
          indicators: {
            quote: [
              {
                open: [2800.5, 2810, null],
                high: [2850, 2860, 2900],
                low: [2790, 2800, 2820],
                close: [2840.25, 2855, null],
                volume: [1000000, 1200000, null],
              },
            ],
            adjclose: [{ adjclose: [2840.25, 2855, 2870.5] }],
          },
        },
      ],
    },
  };

  it("parses chronological OHLCV bars with ISO dates", () => {
    const bars = parseChartJson(chartFixture);
    expect(bars).toHaveLength(3);
    expect(bars[0]).toEqual({
      date: "2024-01-01",
      open: 2800.5,
      high: 2850,
      low: 2790,
      close: 2840.25,
      volume: 1000000,
    });
    // Dates are sorted ascending.
    expect(bars.map((b) => b.date)).toEqual([
      "2024-01-01",
      "2024-01-02",
      "2024-01-03",
    ]);
  });

  it("falls back to adjclose when close is null", () => {
    const bars = parseChartJson(chartFixture);
    // Third bar close is null -> uses adjclose 2870.5.
    expect(bars[2].close).toBe(2870.5);
  });

  it("stores missing values as null, never zero", () => {
    const bars = parseChartJson(chartFixture);
    expect(bars[2].open).toBeNull();
    expect(bars[2].volume).toBeNull();
  });

  it("returns [] for an empty or error response", () => {
    expect(parseChartJson({})).toEqual([]);
    expect(parseChartJson({ chart: { result: [] } })).toEqual([]);
    expect(parseChartJson({ chart: { result: [{ timestamp: [] }] } })).toEqual(
      [],
    );
  });

  it("skips entries with invalid timestamps", () => {
    const bad = {
      chart: {
        result: [
          {
            timestamp: [1704067200, NaN],
            indicators: { quote: [{ close: [100, 200] }] },
          },
        ],
      },
    };
    const bars = parseChartJson(bad);
    expect(bars).toHaveLength(1);
    expect(bars[0].close).toBe(100);
  });
});

describe("parseFundamentalsTimeseriesJson", () => {
  // Mirrors the real shape: timeseries.result[] with per-metric series, each
  // entry carrying asOfDate + reportedValue.raw (INR, absolute).
  const tsFixture = {
    timeseries: {
      result: [
        {
          meta: { symbol: ["RELIANCE.NS"], type: ["annualTotalRevenue"] },
          annualTotalRevenue: [
            { asOfDate: "2023-03-31", reportedValue: { raw: 8.77835e12 } },
            { asOfDate: "2024-03-31", reportedValue: { raw: 9.01064e12 } },
          ],
        },
        {
          meta: { symbol: ["RELIANCE.NS"], type: ["annualNetIncome"] },
          annualNetIncome: [
            { asOfDate: "2023-03-31", reportedValue: { raw: 6.6702e11 } },
            { asOfDate: "2024-03-31", reportedValue: { raw: 6.9621e11 } },
          ],
        },
        {
          meta: { symbol: ["RELIANCE.NS"], type: ["annualStockholdersEquity"] },
          annualStockholdersEquity: [
            { asOfDate: "2024-03-31", reportedValue: { raw: 7.9e12 } },
          ],
        },
      ],
    },
  };

  it("pivots per-metric series into one record per fiscal year", () => {
    const rows = parseFundamentalsTimeseriesJson(tsFixture);
    expect(rows.map((r) => r.fiscalYear)).toEqual([2023, 2024]);

    const fy2024 = rows.find((r) => r.fiscalYear === 2024)!;
    expect(fy2024.revenue).toBe(9.01064e12);
    expect(fy2024.netProfit).toBe(6.9621e11);
    expect(fy2024.totalEquity).toBe(7.9e12);
  });

  it("leaves metrics absent for a year as null (not zero)", () => {
    const rows = parseFundamentalsTimeseriesJson(tsFixture);
    const fy2023 = rows.find((r) => r.fiscalYear === 2023)!;
    // Equity only reported for 2024 in the fixture.
    expect(fy2023.totalEquity).toBeNull();
    expect(fy2023.totalDebt).toBeNull();
  });

  it("ignores entries with no raw value or no asOfDate", () => {
    const partial = {
      timeseries: {
        result: [
          {
            meta: { type: ["annualTotalRevenue"] },
            annualTotalRevenue: [
              { asOfDate: "2024-03-31", reportedValue: {} }, // no raw
              { reportedValue: { raw: 123 } }, // no asOfDate
              { asOfDate: "2024-03-31", reportedValue: { raw: 500 } }, // valid
            ],
          },
        ],
      },
    };
    const rows = parseFundamentalsTimeseriesJson(partial);
    expect(rows).toHaveLength(1);
    expect(rows[0].revenue).toBe(500);
  });

  it("returns [] for an empty response", () => {
    expect(parseFundamentalsTimeseriesJson({})).toEqual([]);
    expect(parseFundamentalsTimeseriesJson({ timeseries: { result: [] } })).toEqual(
      [],
    );
  });

  it("requests a non-empty, de-duplicated key set", () => {
    expect(FUNDAMENTALS_TIMESERIES_KEYS.length).toBeGreaterThan(10);
    expect(new Set(FUNDAMENTALS_TIMESERIES_KEYS).size).toBe(
      FUNDAMENTALS_TIMESERIES_KEYS.length,
    );
    expect(FUNDAMENTALS_TIMESERIES_KEYS).toContain("annualTotalRevenue");
  });
});
