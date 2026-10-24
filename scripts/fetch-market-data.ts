/**
 * Fetch market data from Yahoo into Supabase, then compute metrics.
 *
 *   pnpm fetch
 *
 * Per active stock (1s delay between stocks):
 *  1. Upsert ~5y daily price history (incremental after the first run).
 *  2. Upsert annual fundamentals, converted to INR crore in ONE function.
 *  3. Compute + upsert stock_metrics (pure functions in src/lib/data/metrics).
 *
 * Never defaults or invents values: missing data is stored as NULL.
 */
import { db } from "./lib/db";
import { BENCHMARK_YAHOO_SYMBOL } from "@/config/universe";
import {
  getHistory,
  getQuoteSummary,
  getAnnualFundamentals,
  type AnnualFundamental,
  type DailyBar,
} from "@/lib/data/yahoo";
import {
  computeRoe,
  computeRoce,
  computeOperatingMargin,
  computeDebtToEquity,
  computeInterestCoverage,
  computeCagrFromSeries,
  computePeg,
  computeVolatility1y,
  computeMaxDrawdown,
  computeBeta,
  alignReturns,
  dailyReturnMap,
  compute52Week,
} from "@/lib/data/metrics";
import type { TablesInsert } from "@/types/database";

const CRORE = 1e7; // 1 crore = 10,000,000
const SLEEP_MS = 1000;
const HISTORY_YEARS = 5;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Convert a raw Yahoo annual fundamental (absolute INR) to INR crore.
 * Single documented conversion point. Per-share counts are NOT divided.
 */
function toCrore(f: AnnualFundamental): TablesInsert<"fundamentals_annual"> {
  const c = (v: number | null) => (v == null ? null : v / CRORE);
  return {
    stock_id: "", // filled by caller
    fiscal_year: f.fiscalYear,
    revenue: c(f.revenue),
    operating_profit: c(f.operatingProfit),
    net_profit: c(f.netProfit),
    total_debt: c(f.totalDebt),
    total_equity: c(f.totalEquity),
    total_assets: c(f.totalAssets),
    current_liabilities: c(f.currentLiabilities),
    operating_cash_flow: c(f.operatingCashFlow),
    interest_expense: c(f.interestExpense),
    ebit: c(f.ebit),
    dividends_paid: c(f.dividendsPaid),
    shares_outstanding: f.sharesOutstanding, // count, not money
  };
}

interface FetchResult {
  symbol: string;
  status: "ok" | "partial" | "error";
  nullMetrics: number;
  note?: string;
}

async function getLastPriceDate(stockId: string): Promise<string | null> {
  const { data } = await db
    .from("price_history")
    .select("date")
    .eq("stock_id", stockId)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.date ?? null;
}

async function upsertHistory(stockId: string, bars: DailyBar[]) {
  if (bars.length === 0) return;
  const rows: TablesInsert<"price_history">[] = bars.map((b) => ({
    stock_id: stockId,
    date: b.date,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
  }));
  // Upsert in chunks to stay within payload limits.
  const CHUNK = 1000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await db
      .from("price_history")
      .upsert(rows.slice(i, i + CHUNK), { onConflict: "stock_id,date" });
    if (error) throw new Error(`price upsert: ${error.message}`);
  }
}

function countNulls(m: TablesInsert<"stock_metrics">): number {
  const keys: (keyof TablesInsert<"stock_metrics">)[] = [
    "price", "prev_close", "market_cap", "pe", "pb", "roe", "roce",
    "operating_margin", "debt_to_equity", "interest_coverage",
    "dividend_yield", "revenue_cagr_3y", "revenue_cagr_5y",
    "profit_cagr_3y", "profit_cagr_5y", "peg", "volatility_1y",
    "max_drawdown_3y", "beta", "week52_high", "week52_low",
  ];
  return keys.reduce((n, k) => (m[k] == null ? n + 1 : n), 0);
}

async function main() {
  console.log("Fetching market data…\n");

  // Active stocks.
  const { data: stocks, error } = await db
    .from("stocks")
    .select("id, symbol, yahoo_symbol")
    .eq("is_active", true)
    .order("symbol");
  if (error) throw new Error(`read stocks: ${error.message}`);
  if (!stocks || stocks.length === 0) {
    console.log("No active stocks. Run `pnpm seed` first.");
    return;
  }

  // Benchmark history (once) for beta.
  const since = new Date();
  since.setFullYear(since.getFullYear() - HISTORY_YEARS);

  let benchmarkReturns = new Map<string, number>();
  try {
    const benchBars = await getHistory(BENCHMARK_YAHOO_SYMBOL, since);
    benchmarkReturns = dailyReturnMap(
      benchBars.map((b) => ({ date: b.date, close: b.close })),
    );
    console.log(`✓ Benchmark ${BENCHMARK_YAHOO_SYMBOL}: ${benchBars.length} bars\n`);
  } catch (e) {
    console.warn(`! Benchmark fetch failed — beta will be null. ${e}\n`);
  }

  const results: FetchResult[] = [];

  for (const stock of stocks) {
    const yahoo = stock.yahoo_symbol;
    if (!yahoo) {
      results.push({ symbol: stock.symbol, status: "error", nullMetrics: 21, note: "no yahoo_symbol" });
      continue;
    }

    try {
      // Incremental history: start the day after the latest stored bar.
      const last = await getLastPriceDate(stock.id);
      const period1 = last
        ? new Date(new Date(last).getTime() + 86400000)
        : since;

      const freshBars = await getHistory(yahoo, period1);
      await upsertHistory(stock.id, freshBars);

      // Full close series (from DB) for price metrics.
      const { data: allBars } = await db
        .from("price_history")
        .select("date, close")
        .eq("stock_id", stock.id)
        .order("date", { ascending: true });
      const series = (allBars ?? []).map((b) => ({ date: b.date, close: b.close }));
      const closes = series
        .map((s) => s.close)
        .filter((c): c is number => typeof c === "number");

      // Fundamentals -> crore.
      const annual = await getAnnualFundamentals(yahoo);
      if (annual.length > 0) {
        const rows = annual.map((f) => ({ ...toCrore(f), stock_id: stock.id }));
        const { error: fErr } = await db
          .from("fundamentals_annual")
          .upsert(rows, { onConflict: "stock_id,fiscal_year" });
        if (fErr) throw new Error(`fundamentals upsert: ${fErr.message}`);
      }

      // Quote summary for price/valuation metrics.
      const summary = await getQuoteSummary(yahoo);

      // --- Compute metrics (code only) ---
      const latest = annual.at(-1) ?? null;
      const revSeries = annual.map((a) => a.revenue);
      const profitSeries = annual.map((a) => a.netProfit);

      const revenueCagr3y = computeCagrFromSeries(revSeries, 3);
      const revenueCagr5y = computeCagrFromSeries(revSeries, 5);
      const profitCagr3y = computeCagrFromSeries(profitSeries, 3);
      const profitCagr5y = computeCagrFromSeries(profitSeries, 5);

      const pe = summary.summaryDetail?.trailingPE ?? null;
      const pb =
        summary.summaryDetail?.priceToBook ??
        summary.defaultKeyStatistics?.priceToBook ??
        null;

      // Beta from aligned daily returns; fall back to Yahoo's beta if our
      // series is too short. (Still code-computed when possible.)
      const stockReturns = dailyReturnMap(series);
      const aligned = alignReturns(stockReturns, benchmarkReturns);
      const computedBeta = computeBeta(aligned.stock, aligned.market);
      const beta =
        computedBeta ??
        summary.summaryDetail?.beta ??
        summary.defaultKeyStatistics?.beta ??
        null;

      const week52 = compute52Week(closes);

      // 3y drawdown: last ~3*252 closes.
      const dd3y = computeMaxDrawdown(closes.slice(-(3 * 252)));

      // Dividend yield to percent (Yahoo gives a fraction).
      const divFrac = summary.summaryDetail?.dividendYield ?? null;
      const dividendYield = divFrac == null ? null : divFrac * 100;

      const metrics: TablesInsert<"stock_metrics"> = {
        stock_id: stock.id,
        as_of: new Date().toISOString().slice(0, 10),
        price:
          summary.price?.regularMarketPrice ??
          summary.financialData?.currentPrice ??
          (closes.at(-1) ?? null),
        prev_close: summary.price?.regularMarketPreviousClose ?? null,
        market_cap: summary.price?.marketCap
          ? summary.price.marketCap / CRORE
          : null,
        pe,
        pb,
        roe: computeRoe(latest?.netProfit ?? null, latest?.totalEquity ?? null),
        roce: computeRoce(
          latest?.ebit ?? null,
          latest?.totalAssets ?? null,
          latest?.currentLiabilities ?? null,
          latest?.totalEquity ?? null,
          latest?.totalDebt ?? null,
        ),
        operating_margin: computeOperatingMargin(
          latest?.operatingProfit ?? null,
          latest?.revenue ?? null,
        ),
        debt_to_equity: computeDebtToEquity(
          latest?.totalDebt ?? null,
          latest?.totalEquity ?? null,
        ),
        interest_coverage: computeInterestCoverage(
          latest?.ebit ?? null,
          latest?.interestExpense ?? null,
        ),
        dividend_yield: dividendYield,
        revenue_cagr_3y: revenueCagr3y,
        revenue_cagr_5y: revenueCagr5y,
        profit_cagr_3y: profitCagr3y,
        profit_cagr_5y: profitCagr5y,
        peg: computePeg(pe, profitCagr3y),
        volatility_1y: computeVolatility1y(closes),
        max_drawdown_3y: dd3y,
        beta,
        week52_high: week52.high,
        week52_low: week52.low,
      };

      const { error: mErr } = await db
        .from("stock_metrics")
        .upsert(metrics, { onConflict: "stock_id" });
      if (mErr) throw new Error(`metrics upsert: ${mErr.message}`);

      const nulls = countNulls(metrics);
      results.push({
        symbol: stock.symbol,
        status: nulls > 0 ? "partial" : "ok",
        nullMetrics: nulls,
      });
      console.log(`✓ ${stock.symbol}: ${freshBars.length} new bars, ${nulls} null metrics`);
    } catch (e) {
      results.push({
        symbol: stock.symbol,
        status: "error",
        nullMetrics: 21,
        note: (e as Error).message,
      });
      console.error(`✗ ${stock.symbol}: ${(e as Error).message}`);
    }

    await sleep(SLEEP_MS);
  }

  // Final summary table.
  console.log("\n─────────────── Summary ───────────────");
  console.log("SYMBOL".padEnd(14) + "STATUS".padEnd(10) + "NULL METRICS");
  for (const r of results) {
    console.log(
      r.symbol.padEnd(14) +
        r.status.padEnd(10) +
        String(r.nullMetrics) +
        (r.note ? `  (${r.note})` : ""),
    );
  }
  const failed = results.filter((r) => r.status === "error").length;
  console.log(`\n${results.length - failed}/${results.length} succeeded.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
