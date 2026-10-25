import type { DailyBar, AnnualFundamental } from "@/lib/data/yahoo";
import type { QuoteSnapshot, ReferenceStock } from "./types";

/**
 * Pure parsers for Tapetide REST responses (envelope `{ data, meta }`). Kept
 * separate from the network code so they are unit-testable against the
 * documented response shapes. A missing figure becomes null — never 0, never
 * invented. Monetary fundamentals are already in INR crore (`unit: inr_crore`).
 */

const n = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

const s = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

// ---------------------------------------------------------------------------
// Stock master list: GET /v1/reference/stocks
// data: [{ symbol, name, isin, nse_symbol, bse_code, listed_on[], status,
//          macro_sector, sector, industry, basic_industry, ... }]
// ---------------------------------------------------------------------------

interface RawReferenceStock {
  symbol?: string;
  name?: string;
  isin?: string | null;
  nse_symbol?: string | null;
  bse_code?: string | null;
  listed_on?: string[];
  status?: string;
  macro_sector?: string | null;
  sector?: string | null;
  industry?: string | null;
}

/** Parse one page of the stock master list into ReferenceStock rows. */
export function parseReferenceStocks(data: unknown): ReferenceStock[] {
  if (!Array.isArray(data)) return [];
  const out: ReferenceStock[] = [];
  for (const row of data as RawReferenceStock[]) {
    const symbol = s(row?.symbol);
    const name = s(row?.name);
    if (!symbol || !name) continue; // identity is required
    const listedOn = Array.isArray(row.listed_on)
      ? row.listed_on.filter((x): x is string => typeof x === "string")
      : [];
    const status =
      row.status === "active" || row.status === "delisted" || row.status === "inactive"
        ? row.status
        : "inactive";
    // Primary exchange: prefer NSE when an NSE symbol exists.
    const nseSymbol = s(row.nse_symbol);
    const exchange = nseSymbol ? "NSE" : listedOn.includes("BSE") ? "BSE" : null;
    out.push({
      symbol,
      name,
      isin: s(row.isin),
      nseSymbol,
      bseCode: s(row.bse_code),
      listedOn,
      status,
      exchange,
      // macro_sector is the broad bucket the existing universe uses (e.g.
      // "Information Technology"); fall back to the finer sector field.
      sector: s(row.macro_sector) ?? s(row.sector),
      industry: s(row.industry),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Daily prices: GET /v1/stocks/{symbol}/prices/daily
// data: [{ date, open, high, low, close, volume, delivery_pct }]
// ---------------------------------------------------------------------------

interface RawDailyBar {
  date?: string;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  volume?: number | null;
}

/** Parse one page of daily-price rows into chronological DailyBars. */
export function parseDailyPrices(data: unknown): DailyBar[] {
  if (!Array.isArray(data)) return [];
  const bars: DailyBar[] = [];
  for (const row of data as RawDailyBar[]) {
    if (!row?.date || typeof row.date !== "string") continue;
    bars.push({
      date: row.date.slice(0, 10),
      open: n(row.open),
      high: n(row.high),
      low: n(row.low),
      close: n(row.close),
      volume: n(row.volume),
    });
  }
  return bars.sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------------------
// Latest quote: GET /v1/stocks/{symbol}/quote
// data: { price, prev_close, market_cap, pe_ttm, pb, dividend_yield?,
//         high_52w, low_52w, updated_at, currency? }
// (field names per the Live Market data overview; absent fields -> null)
// ---------------------------------------------------------------------------

export function parseQuote(data: unknown): QuoteSnapshot {
  const d = (data ?? {}) as Record<string, unknown>;
  // Market cap may arrive as `market_cap_cr` (already crore) or `market_cap`.
  const marketCapCrore =
    n(d.market_cap_cr) ??
    (typeof d.market_cap === "number" ? d.market_cap : null);
  return {
    price: n(d.price) ?? n(d.ltp),
    prevClose: n(d.prev_close),
    marketCapCrore,
    pe: n(d.pe_ttm) ?? n(d.pe),
    pb: n(d.pb),
    dividendYield: n(d.dividend_yield),
    week52High: n(d.high_52w),
    week52Low: n(d.low_52w),
    asOf: typeof d.updated_at === "string" ? d.updated_at : null,
    currency: typeof d.currency === "string" ? d.currency : null,
  };
}

// ---------------------------------------------------------------------------
// Fundamentals: GET /v1/stocks/{symbol}/fundamentals
// data: [{ metric, period_type, period_end, basis, value, unit, available_from }]
// Tidy/long format — pivot annual rows into one AnnualFundamental per FY.
// ---------------------------------------------------------------------------

interface RawFundamentalRow {
  metric?: string;
  period_type?: string;
  period_end?: string;
  value?: number | null;
  unit?: string;
}

/**
 * Map each AnnualFundamental field to the Tapetide metric that supplies it.
 * Fields Tapetide's Indian-statement format does not expose are intentionally
 * absent here and therefore left null (never invented):
 *   gross_profit, cost_of_revenue, current_assets, current_liabilities,
 *   dividends_paid, shares_outstanding, long_term_debt, retained_earnings.
 * `total_equity` is derived as share_capital + reserves (Indian format).
 * `ebit` falls back to operating_profit (as the Yahoo path also did).
 */
const DIRECT_METRIC: Partial<Record<keyof AnnualFundamental, string>> = {
  revenue: "revenue",
  operatingProfit: "operating_profit",
  netProfit: "net_profit",
  totalDebt: "borrowings",
  totalAssets: "total_assets",
  totalLiabilities: "total_liabilities",
  operatingCashFlow: "cash_from_operations",
  interestExpense: "interest_expense",
  ebit: "operating_profit",
};

/** Parse (possibly multi-page, pre-concatenated) fundamentals rows. */
export function parseFundamentals(data: unknown): AnnualFundamental[] {
  if (!Array.isArray(data)) return [];

  // byYear[fiscalYear][metric] = value (annual rows only).
  const byYear = new Map<number, Record<string, number>>();
  for (const row of data as RawFundamentalRow[]) {
    if (row?.period_type !== "annual") continue;
    const metric = row.metric;
    const end = row.period_end;
    const value = row.value;
    if (!metric || !end || typeof value !== "number" || !Number.isFinite(value))
      continue;
    const year = new Date(end).getFullYear();
    if (!Number.isFinite(year)) continue;
    const bucket = byYear.get(year) ?? {};
    bucket[metric] = value;
    byYear.set(year, bucket);
  }

  const allFields: (keyof AnnualFundamental)[] = [
    "revenue", "operatingProfit", "netProfit", "totalDebt", "totalEquity",
    "totalAssets", "currentLiabilities", "operatingCashFlow", "interestExpense",
    "ebit", "dividendsPaid", "sharesOutstanding", "currentAssets", "grossProfit",
    "costOfRevenue", "retainedEarnings", "longTermDebt", "totalLiabilities",
  ];

  return [...byYear.entries()]
    .map(([fiscalYear, bucket]) => {
      const out = { fiscalYear } as AnnualFundamental;
      for (const field of allFields) {
        if (field === "fiscalYear") continue;
        const metric = DIRECT_METRIC[field];
        out[field] = metric != null ? (n(bucket[metric]) as number | null) : null;
      }
      // Indian-format equity = share_capital + reserves (both required).
      const sc = n(bucket["share_capital"]);
      const res = n(bucket["reserves"]);
      out.totalEquity = sc != null && res != null ? sc + res : null;
      return out;
    })
    .sort((a, b) => a.fiscalYear - b.fiscalYear);
}
