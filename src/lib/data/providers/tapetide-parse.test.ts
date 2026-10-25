import { describe, it, expect } from "vitest";
import {
  parseDailyPrices,
  parseQuote,
  parseFundamentals,
  parseReferenceStocks,
} from "./tapetide-parse";
import { toTapetideSymbol } from "./tapetide";

/**
 * Fixtures mirror the documented Tapetide response shapes
 * (https://developers.tapetide.com). All monetary fundamentals are INR crore;
 * a missing figure is null, never 0.
 */

describe("toTapetideSymbol", () => {
  it("strips exchange suffixes and upper-cases", () => {
    expect(toTapetideSymbol("RELIANCE.NS")).toBe("RELIANCE");
    expect(toTapetideSymbol("tcs")).toBe("TCS");
    expect(toTapetideSymbol("INFY.BO")).toBe("INFY");
    expect(toTapetideSymbol("HDFCBANK")).toBe("HDFCBANK");
  });
});

describe("parseDailyPrices", () => {
  // Shape per liststockdailyprices: data[].{date,open,high,low,close,volume,delivery_pct}
  const data = [
    { date: "2024-01-02", open: 2810, high: 2860, low: 2800, close: 2855, volume: 1200000, delivery_pct: 45.6 },
    { date: "2024-01-01", open: 2800.5, high: 2850, low: 2790, close: 2840.25, volume: 1000000, delivery_pct: null },
    { date: "2024-01-03", open: null, high: 2900, low: 2820, close: null, volume: null, delivery_pct: null },
  ];

  it("maps and sorts bars chronologically", () => {
    const bars = parseDailyPrices(data);
    expect(bars.map((b) => b.date)).toEqual([
      "2024-01-01",
      "2024-01-02",
      "2024-01-03",
    ]);
    expect(bars[0]).toEqual({
      date: "2024-01-01",
      open: 2800.5,
      high: 2850,
      low: 2790,
      close: 2840.25,
      volume: 1000000,
    });
  });

  it("keeps missing OHLCV as null, never 0", () => {
    const bars = parseDailyPrices(data);
    expect(bars[2].open).toBeNull();
    expect(bars[2].close).toBeNull();
    expect(bars[2].volume).toBeNull();
  });

  it("returns [] for non-array / empty", () => {
    expect(parseDailyPrices(null)).toEqual([]);
    expect(parseDailyPrices([])).toEqual([]);
    expect(parseDailyPrices({})).toEqual([]);
  });
});

describe("parseQuote", () => {
  it("maps the documented quote fields", () => {
    const q = parseQuote({
      symbol: "TCS",
      price: 2427,
      prev_close: 2350,
      market_cap: 879000,
      pe_ttm: 17.63,
      pb: 12.1,
      high_52w: 3350,
      low_52w: 2200,
      updated_at: "2026-10-16T05:57:16+00:00",
      currency: "INR",
    });
    expect(q.price).toBe(2427);
    expect(q.prevClose).toBe(2350);
    expect(q.marketCapCrore).toBe(879000);
    expect(q.pe).toBe(17.63);
    expect(q.pb).toBe(12.1);
    expect(q.week52High).toBe(3350);
    expect(q.week52Low).toBe(2200);
    expect(q.asOf).toBe("2026-10-16T05:57:16+00:00");
    expect(q.currency).toBe("INR");
  });

  it("prefers market_cap_cr and ltp aliases when present", () => {
    const q = parseQuote({ ltp: 100, market_cap_cr: 500 });
    expect(q.price).toBe(100);
    expect(q.marketCapCrore).toBe(500);
  });

  it("leaves unavailable fields null (e.g. no dividend yield in quote)", () => {
    const q = parseQuote({ price: 100, prev_close: 99 });
    expect(q.pe).toBeNull();
    expect(q.pb).toBeNull();
    expect(q.dividendYield).toBeNull();
    expect(q.marketCapCrore).toBeNull();
  });
});

describe("parseFundamentals", () => {
  // Tidy/long format: one row per metric+period. INR crore.
  const data = [
    { metric: "revenue", period_type: "annual", period_end: "2023-03-31", basis: "consolidated", value: 877835, unit: "inr_crore", available_from: "2023-05-01" },
    { metric: "revenue", period_type: "annual", period_end: "2024-03-31", basis: "consolidated", value: 901064, unit: "inr_crore", available_from: "2024-05-01" },
    { metric: "net_profit", period_type: "annual", period_end: "2024-03-31", basis: "consolidated", value: 69621, unit: "inr_crore", available_from: "2024-05-01" },
    { metric: "share_capital", period_type: "annual", period_end: "2024-03-31", basis: "consolidated", value: 6766, unit: "inr_crore", available_from: "2024-05-01" },
    { metric: "reserves", period_type: "annual", period_end: "2024-03-31", basis: "consolidated", value: 786577, unit: "inr_crore", available_from: "2024-05-01" },
    { metric: "borrowings", period_type: "annual", period_end: "2024-03-31", basis: "consolidated", value: 323000, unit: "inr_crore", available_from: "2024-05-01" },
    { metric: "operating_profit", period_type: "annual", period_end: "2024-03-31", basis: "consolidated", value: 150000, unit: "inr_crore", available_from: "2024-05-01" },
    // A QUARTERLY row that must be ignored by the annual pivot.
    { metric: "revenue", period_type: "quarter", period_end: "2024-06-30", basis: "consolidated", value: 230000, unit: "inr_crore", available_from: "2024-07-20" },
  ];

  it("pivots annual rows into one record per fiscal year (crore, no conversion)", () => {
    const rows = parseFundamentals(data);
    expect(rows.map((r) => r.fiscalYear)).toEqual([2023, 2024]);
    const fy24 = rows.find((r) => r.fiscalYear === 2024)!;
    expect(fy24.revenue).toBe(901064);
    expect(fy24.netProfit).toBe(69621);
    expect(fy24.totalDebt).toBe(323000);
    expect(fy24.operatingProfit).toBe(150000);
    // ebit falls back to operating_profit.
    expect(fy24.ebit).toBe(150000);
  });

  it("derives total_equity as share_capital + reserves", () => {
    const rows = parseFundamentals(data);
    const fy24 = rows.find((r) => r.fiscalYear === 2024)!;
    expect(fy24.totalEquity).toBe(6766 + 786577);
  });

  it("leaves equity null when either share_capital or reserves is missing", () => {
    const rows = parseFundamentals(data);
    const fy23 = rows.find((r) => r.fiscalYear === 2023)!; // only revenue present
    expect(fy23.totalEquity).toBeNull();
    expect(fy23.netProfit).toBeNull();
  });

  it("leaves fields Tapetide does not expose as null (not invented)", () => {
    const rows = parseFundamentals(data);
    const fy24 = rows.find((r) => r.fiscalYear === 2024)!;
    expect(fy24.grossProfit).toBeNull();
    expect(fy24.costOfRevenue).toBeNull();
    expect(fy24.currentAssets).toBeNull();
    expect(fy24.sharesOutstanding).toBeNull();
    expect(fy24.dividendsPaid).toBeNull();
    expect(fy24.longTermDebt).toBeNull();
  });

  it("ignores quarterly rows in the annual pivot", () => {
    const rows = parseFundamentals(data);
    // 2024 revenue is the annual 901064, not the quarterly 230000.
    const fy24 = rows.find((r) => r.fiscalYear === 2024)!;
    expect(fy24.revenue).toBe(901064);
  });

  it("returns [] for non-array / empty", () => {
    expect(parseFundamentals(null)).toEqual([]);
    expect(parseFundamentals([])).toEqual([]);
  });
});

describe("parseReferenceStocks", () => {
  // Shape per listreferencestocks.
  const data = [
    {
      symbol: "RELIANCE",
      name: "Reliance Industries Ltd",
      isin: "INE002A01018",
      nse_symbol: "RELIANCE",
      bse_code: "500325",
      listed_on: ["NSE", "BSE"],
      status: "active",
      macro_sector: "Energy",
      sector: "Oil Gas & Consumable Fuels",
      industry: "Refineries",
    },
    {
      // BSE-only company: symbol is the BSE scrip code, no NSE symbol.
      symbol: "539876",
      name: "Some BSE Only Ltd",
      isin: "INE000X01010",
      nse_symbol: null,
      bse_code: "539876",
      listed_on: ["BSE"],
      status: "active",
      macro_sector: null,
      sector: "Textiles",
      industry: null,
    },
    {
      symbol: "DELISTEDCO",
      name: "Delisted Co",
      nse_symbol: "DELISTEDCO",
      bse_code: null,
      listed_on: ["NSE"],
      status: "delisted",
      macro_sector: "Industrials",
    },
    // Invalid rows: missing symbol / missing name — must be dropped.
    { name: "No Symbol Ltd", status: "active", listed_on: ["NSE"] },
    { symbol: "NONAME", status: "active", listed_on: ["NSE"] },
  ];

  it("normalizes identity and derives the primary exchange", () => {
    const rows = parseReferenceStocks(data);
    const rel = rows.find((r) => r.symbol === "RELIANCE")!;
    expect(rel.exchange).toBe("NSE"); // NSE symbol present
    expect(rel.nseSymbol).toBe("RELIANCE");
    expect(rel.bseCode).toBe("500325");
    expect(rel.isin).toBe("INE002A01018");
    // macro_sector preferred as the broad sector bucket.
    expect(rel.sector).toBe("Energy");
    expect(rel.industry).toBe("Refineries");
  });

  it("maps BSE-only companies to the BSE exchange", () => {
    const rows = parseReferenceStocks(data);
    const bse = rows.find((r) => r.symbol === "539876")!;
    expect(bse.exchange).toBe("BSE");
    expect(bse.nseSymbol).toBeNull();
    // Falls back to sector when macro_sector is null.
    expect(bse.sector).toBe("Textiles");
    expect(bse.industry).toBeNull();
  });

  it("preserves listing status (for eligibility filtering downstream)", () => {
    const rows = parseReferenceStocks(data);
    expect(rows.find((r) => r.symbol === "RELIANCE")!.status).toBe("active");
    expect(rows.find((r) => r.symbol === "DELISTEDCO")!.status).toBe("delisted");
  });

  it("drops rows missing a symbol or name (identity required)", () => {
    const rows = parseReferenceStocks(data);
    const symbols = rows.map((r) => r.symbol);
    expect(symbols).toContain("RELIANCE");
    // "NONAME" has a symbol but no name -> dropped.
    // "No Symbol Ltd" has a name but no symbol -> dropped.
    expect(symbols).not.toContain("NONAME");
    // Only the 3 complete rows survive.
    expect(rows).toHaveLength(3);
  });

  it("returns [] for non-array / empty", () => {
    expect(parseReferenceStocks(null)).toEqual([]);
    expect(parseReferenceStocks([])).toEqual([]);
    expect(parseReferenceStocks({})).toEqual([]);
  });
});
