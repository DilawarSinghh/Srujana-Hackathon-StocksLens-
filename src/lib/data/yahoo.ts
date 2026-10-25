import yahooFinance from "yahoo-finance2";
import { z } from "zod";
import {
  parseChartJson,
  parseFundamentalsTimeseriesJson,
  FUNDAMENTALS_TIMESERIES_KEYS,
} from "./yahoo-parse";

/**
 * Yahoo Finance adapter (scripts/server only — NEVER called from the browser).
 *
 * Two data paths per call:
 *  1. Primary: `yahoo-finance2` (handles cookies/crumb when it can).
 *  2. Fallback: direct HTTP to Yahoo's crumb-FREE endpoints
 *     (`v8/finance/chart`, `fundamentals-timeseries`) when the library throws
 *     an invalid-crumb / 429 / "Too Many Requests" error. The crumb-gated
 *     quoteSummary/quote endpoints (P/E, P/B, market cap, dividend yield) have
 *     no crumb-free equivalent, so those fields stay NULL when the library
 *     path fails — never fabricated.
 *
 * All HTTP is 429-aware: bounded retries with exponential backoff + jitter,
 * honoring `Retry-After`. Retries are deliberately gentle so they do not make
 * throttling worse.
 */

// Quiet the library's notices/validation noise in scripts.
yahooFinance.suppressNotices?.(["yahooSurvey", "ripHistorical"]);

const YAHOO_HOST = "https://query1.finance.yahoo.com";
const DIRECT_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** True when an error looks like a crumb failure or a Yahoo rate-limit. */
function isCrumbOrRateLimitError(err: unknown): boolean {
  const msg = (err as Error)?.message ?? String(err);
  return /invalid crumb|too many requests|\b429\b|unauthorized|unable to access/i.test(
    msg,
  );
}

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
        await sleep(waitMs);
      }
    }
  }
  throw new Error(`${label} failed after ${attempts} attempts: ${lastErr}`);
}

/** Raised when a direct Yahoo request is throttled after exhausting retries. */
export class YahooRateLimitError extends Error {
  constructor(label: string) {
    super(`${label}: Yahoo returned HTTP 429 (rate limited) after retries`);
    this.name = "YahooRateLimitError";
  }
}

/**
 * GET a crumb-free Yahoo JSON endpoint with bounded, jittered backoff.
 * Honors `Retry-After` on 429. Throws `YahooRateLimitError` if still throttled
 * after `attempts`, or a plain Error for other non-OK responses.
 */
async function fetchYahooJson(
  url: string,
  label: string,
  attempts = 4,
): Promise<unknown> {
  let backoff = 2000;
  let last429 = false;
  for (let i = 0; i < attempts; i++) {
    let res: Response;
    try {
      res = await fetch(url, { headers: { "user-agent": DIRECT_UA } });
    } catch (e) {
      // Network error: brief retry, then give up.
      if (i === attempts - 1) throw e;
      await sleep(backoff + Math.random() * 500);
      backoff = Math.min(backoff * 2, 20000);
      continue;
    }

    if (res.status === 429) {
      last429 = true;
      const retryAfter = Number(res.headers.get("retry-after"));
      const waitMs =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : backoff + Math.random() * 500; // jitter
      if (i < attempts - 1) {
        console.warn(`  ${label}: HTTP 429, waiting ${Math.round(waitMs)}ms`);
        await sleep(waitMs);
        backoff = Math.min(backoff * 2, 20000);
        continue;
      }
      break;
    }

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`${label}: HTTP ${res.status} ${text.slice(0, 120)}`);
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`${label}: non-JSON response ${text.slice(0, 80)}`);
    }
  }
  if (last429) throw new YahooRateLimitError(label);
  throw new Error(`${label}: failed after ${attempts} attempts`);
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
  try {
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
  } catch (err) {
    if (!isCrumbOrRateLimitError(err)) throw err;
    // Fallback: direct crumb-free v8 chart endpoint.
    console.warn(`  history ${yahooSymbol}: library failed, trying direct v8 chart`);
    const p1 = Math.floor(period1.getTime() / 1000);
    const p2 = Math.floor(Date.now() / 1000);
    const url = `${YAHOO_HOST}/v8/finance/chart/${encodeURIComponent(
      yahooSymbol,
    )}?period1=${p1}&period2=${p2}&interval=1d`;
    const json = await fetchYahooJson(url, `history ${yahooSymbol} (direct)`);
    return parseChartJson(json);
  }
}

/**
 * Chart `meta` for a symbol via the crumb-free v8 endpoint: the previous close
 * and currency. Used to derive `prev_close` when the crumb-gated quoteSummary
 * is unavailable. Returns nulls (never fabricated values) on absence.
 */
export async function getChartMeta(
  yahooSymbol: string,
): Promise<{ previousClose: number | null; currency: string | null; regularMarketPrice: number | null }> {
  const url = `${YAHOO_HOST}/v8/finance/chart/${encodeURIComponent(
    yahooSymbol,
  )}?range=5d&interval=1d`;
  const json = (await fetchYahooJson(url, `chartMeta ${yahooSymbol}`)) as {
    chart?: { result?: { meta?: Record<string, unknown> }[] };
  };
  const meta = json?.chart?.result?.[0]?.meta ?? {};
  const n = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  return {
    previousClose: n(meta.chartPreviousClose) ?? n(meta.previousClose),
    currency: typeof meta.currency === "string" ? meta.currency : null,
    regularMarketPrice: n(meta.regularMarketPrice),
  };
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
  try {
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
  } catch (err) {
    if (!isCrumbOrRateLimitError(err)) throw err;
    // The crumb-gated quoteSummary has no crumb-free equivalent. Recover only
    // what the crumb-FREE chart meta provides: previous close, current price,
    // currency. Every other valuation field stays NULL (never fabricated).
    console.warn(
      `  quoteSummary ${yahooSymbol}: crumb unavailable, deriving prev_close from chart meta`,
    );
    try {
      const meta = await getChartMeta(yahooSymbol);
      return quoteSummarySchema.parse({
        price: {
          regularMarketPrice: meta.regularMarketPrice,
          regularMarketPreviousClose: meta.previousClose,
        },
      });
    } catch {
      // Even the chart meta is throttled: return an empty (all-NULL) summary.
      return quoteSummarySchema.parse({});
    }
  }
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
  currentAssets: number | null;
  grossProfit: number | null;
  costOfRevenue: number | null;
  retainedEarnings: number | null;
  longTermDebt: number | null;
  totalLiabilities: number | null;
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

  try {
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
    return parseLibraryFundamentals(Array.isArray(raw) ? raw : []);
  } catch (err) {
    if (!isCrumbOrRateLimitError(err)) throw err;
    // Fallback: direct crumb-free fundamentals-timeseries endpoint.
    console.warn(
      `  fundamentals ${yahooSymbol}: library failed, trying direct timeseries`,
    );
    const p1 = Math.floor(start.getTime() / 1000);
    const p2 = Math.floor(now.getTime() / 1000);
    const url = `${YAHOO_HOST}/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(
      yahooSymbol,
    )}?symbol=${encodeURIComponent(yahooSymbol)}&type=${FUNDAMENTALS_TIMESERIES_KEYS.join(
      ",",
    )}&period1=${p1}&period2=${p2}&merge=false`;
    const json = await fetchYahooJson(url, `fundamentals ${yahooSymbol} (direct)`);
    return parseFundamentalsTimeseriesJson(json);
  }
}

/**
 * Parse the `yahoo-finance2` library's `fundamentalsTimeSeries` output (array
 * of already-normalized objects with `annual*` keys + a `date`).
 */
function parseLibraryFundamentals(
  rows: unknown[],
): AnnualFundamental[] {
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
        currentAssets: pick(rec, "annualCurrentAssets"),
        grossProfit: pick(rec, "annualGrossProfit"),
        costOfRevenue: pick(rec, "annualCostOfRevenue", "annualReconciledCostOfRevenue"),
        retainedEarnings: pick(rec, "annualRetainedEarnings"),
        longTermDebt: pick(
          rec,
          "annualLongTermDebt",
          "annualLongTermDebtAndCapitalLeaseObligation",
        ),
        totalLiabilities: pick(
          rec,
          "annualTotalLiabilitiesNetMinorityInterest",
          "annualTotalLiabilities",
        ),
      } satisfies AnnualFundamental;
    })
    .filter((x): x is AnnualFundamental => x !== null)
    .sort((a, b) => a.fiscalYear - b.fiscalYear);
}
