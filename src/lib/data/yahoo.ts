import yahooFinance from "yahoo-finance2";
import { z } from "zod";

/**
 * Thin wrapper over yahoo-finance2.
 *  - retry with exponential backoff (3 attempts)
 *  - zod parsing; any missing field becomes null
 *  - NEVER called from the browser (scripts/server only)
 */

// Quiet the library's notices/validation noise in scripts.
yahooFinance.suppressNotices?.(["yahooSurvey", "ripHistorical"]);

async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  attempts = 3,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = (err as Error)?.message ?? String(err);
      const rateLimited = /too many requests|429/i.test(msg);
      // Longer backoff for rate limits: 5s, 10s, 20s. Otherwise 0.5s, 1s, 2s.
      const base = rateLimited ? 5000 : 500;
      const waitMs = base * 2 ** i;
      if (i < attempts - 1) {
        console.warn(
          `  retry ${i + 1}/${attempts - 1} for ${label} after ${waitMs}ms: ${msg}`,
        );
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
  }
  throw new Error(`${label} failed after ${attempts} attempts: ${lastErr}`);
}

const num = () => z.number().finite().nullable().catch(null);

// ---------------------------------------------------------------------------
// Daily history
// ---------------------------------------------------------------------------

export interface DailyBar {
  date: string; // YYYY-MM-DD
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

const toNull = (v: number | null | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** Daily OHLCV history from `period1` to now (chronological). */
export async function getHistory(
  yahooSymbol: string,
  period1: Date,
): Promise<DailyBar[]> {
  const rows = await withRetry(
    () =>
      yahooFinance.chart(yahooSymbol, {
        period1,
        interval: "1d",
      }),
    `history ${yahooSymbol}`,
  );

  const quotes = rows?.quotes ?? [];
  return quotes
    .filter((q) => q.date)
    .map((q) => ({
      date: new Date(q.date).toISOString().slice(0, 10),
      open: toNull(q.open),
      high: toNull(q.high),
      low: toNull(q.low),
      close: toNull(q.close ?? q.adjclose),
      volume: toNull(q.volume),
    }));
}

// ---------------------------------------------------------------------------
// Quote summary (price + financials)
// ---------------------------------------------------------------------------

const quoteSummarySchema = z.object({
  price: z
    .object({
      regularMarketPrice: num(),
      regularMarketPreviousClose: num(),
      marketCap: num(),
    })
    .partial()
    .optional(),
  summaryDetail: z
    .object({
      trailingPE: num(),
      priceToBook: num(),
      dividendYield: num(),
      fiftyTwoWeekHigh: num(),
      fiftyTwoWeekLow: num(),
      beta: num(),
    })
    .partial()
    .optional(),
  defaultKeyStatistics: z
    .object({
      priceToBook: num(),
      sharesOutstanding: num(),
      beta: num(),
      forwardPE: num(),
    })
    .partial()
    .optional(),
  financialData: z
    .object({
      returnOnEquity: num(),
      operatingMargins: num(),
      totalDebt: num(),
      ebitda: num(),
      currentPrice: num(),
    })
    .partial()
    .optional(),
});

export type QuoteSummary = z.infer<typeof quoteSummarySchema>;

export async function getQuoteSummary(
  yahooSymbol: string,
): Promise<QuoteSummary> {
  const raw = await withRetry(
    () =>
      yahooFinance.quoteSummary(yahooSymbol, {
        modules: [
          "price",
          "summaryDetail",
          "defaultKeyStatistics",
          "financialData",
        ],
      }),
    `quoteSummary ${yahooSymbol}`,
  );
  return quoteSummarySchema.parse(raw ?? {});
}

// ---------------------------------------------------------------------------
// Fundamentals (income statement, balance sheet, cash flow)
// ---------------------------------------------------------------------------

export interface AnnualFundamental {
  fiscalYear: number;
  revenue: number | null;
  operatingProfit: number | null;
  netProfit: number | null;
  totalDebt: number | null;
  totalEquity: number | null;
  totalAssets: number | null;
  currentLiabilities: number | null;
  operatingCashFlow: number | null;
  interestExpense: number | null;
  ebit: number | null;
  dividendsPaid: number | null;
  sharesOutstanding: number | null;
}

/**
 * Annual fundamentals via fundamentalsTimeSeries. Values are in the raw
 * reporting currency (INR), NOT yet converted to crore — the fetch script does
 * the crore conversion in one documented place.
 */
export async function getAnnualFundamentals(
  yahooSymbol: string,
): Promise<AnnualFundamental[]> {
  const now = new Date();
  const start = new Date(now.getFullYear() - 6, 0, 1);

  const raw = await withRetry(
    () =>
      yahooFinance.fundamentalsTimeSeries(yahooSymbol, {
        period1: start,
        period2: now,
        type: "annual",
        module: "all",
      }),
    `fundamentals ${yahooSymbol}`,
  );

  const rows = Array.isArray(raw) ? raw : [];
  const pick = (
    r: Record<string, unknown>,
    ...keys: string[]
  ): number | null => {
    for (const k of keys) {
      const v = r[k];
      if (typeof v === "number" && Number.isFinite(v)) return v;
    }
    return null;
  };

  return rows
    .map((r) => {
      const rec = r as Record<string, unknown>;
      const dateVal = rec.date;
      const year =
        dateVal instanceof Date
          ? dateVal.getFullYear()
          : typeof dateVal === "string"
            ? new Date(dateVal).getFullYear()
            : NaN;
      if (!Number.isFinite(year)) return null;

      return {
        fiscalYear: year,
        revenue: pick(rec, "annualTotalRevenue", "annualOperatingRevenue"),
        operatingProfit: pick(rec, "annualOperatingIncome"),
        netProfit: pick(rec, "annualNetIncome", "annualNetIncomeCommonStockholders"),
        totalDebt: pick(rec, "annualTotalDebt"),
        totalEquity: pick(
          rec,
          "annualStockholdersEquity",
          "annualTotalEquityGrossMinorityInterest",
        ),
        totalAssets: pick(rec, "annualTotalAssets"),
        currentLiabilities: pick(rec, "annualCurrentLiabilities"),
        operatingCashFlow: pick(rec, "annualOperatingCashFlow"),
        interestExpense: pick(rec, "annualInterestExpense"),
        ebit: pick(rec, "annualEBIT", "annualOperatingIncome"),
        dividendsPaid: pick(rec, "annualCashDividendsPaid"),
        sharesOutstanding: pick(rec, "annualBasicAverageShares", "annualOrdinarySharesNumber"),
      } satisfies AnnualFundamental;
    })
    .filter((x): x is AnnualFundamental => x !== null)
    .sort((a, b) => a.fiscalYear - b.fiscalYear);
}
