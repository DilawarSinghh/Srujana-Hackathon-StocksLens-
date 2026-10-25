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
import { BENCHMARK_YAHOO_SYMBOL, UNIVERSE } from "@/config/universe";
import type { AnnualFundamental, DailyBar } from "@/lib/data/yahoo";
import {
  getProvider,
  ProviderRateLimitError,
  type MarketDataProvider,
} from "@/lib/data/providers";
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

// Pace between stocks to respect provider rate limits. Override with FETCH_PACE_MS.
const SLEEP_MS = Number(process.env.FETCH_PACE_MS) || 2000;
const HISTORY_YEARS = 5;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Build an actionable stop message for a provider rate-limit abort. */
function rateLimitMessage(e: ProviderRateLimitError): string {
  const sec = e.retryAfterSec;
  let when = "after the daily quota window resets";
  if (sec != null && sec > 0) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const human = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m` : `${sec}s`;
    const at = new Date(Date.now() + sec * 1000).toISOString();
    when = `in ~${human} (around ${at})`;
  }
  return (
    `\n✗ Stopping: the market-data provider is rate-limited (HTTP 429). ` +
    `No data was overwritten; successful writes are preserved and the rerun is ` +
    `idempotent. Re-run \`pnpm fetch\` ${when}, raise TAPETIDE_MAX_RETRY_MS to ` +
    `wait inline (not recommended for long resets), or use a higher-tier plan.`
  );
}

/**
 * Map a provider AnnualFundamental to a DB row. Monetary fields are ALREADY in
 * INR crore per the MarketDataProvider contract (the provider adapter does any
 * currency/unit conversion), so no division happens here. Per-share counts
 * (shares_outstanding) are passed through. Missing fields stay null.
 */
function toFundamentalRow(
  f: AnnualFundamental,
): TablesInsert<"fundamentals_annual"> {
  return {
    stock_id: "", // filled by caller
    fiscal_year: f.fiscalYear,
    revenue: f.revenue,
    operating_profit: f.operatingProfit,
    net_profit: f.netProfit,
    total_debt: f.totalDebt,
    total_equity: f.totalEquity,
    total_assets: f.totalAssets,
    current_liabilities: f.currentLiabilities,
    operating_cash_flow: f.operatingCashFlow,
    interest_expense: f.interestExpense,
    ebit: f.ebit,
    dividends_paid: f.dividendsPaid,
    shares_outstanding: f.sharesOutstanding, // count, not money
    current_assets: f.currentAssets,
    gross_profit: f.grossProfit,
    cost_of_revenue: f.costOfRevenue,
    retained_earnings: f.retainedEarnings,
    long_term_debt: f.longTermDebt,
    total_liabilities: f.totalLiabilities,
  };
}

/**
 * Print a per-stock table of which fundamentals fields Yahoo actually returned
 * (based on the latest fiscal year). Read-only: uses the already-parsed data,
 * makes no extra Yahoo calls. "·" = present, "—" = missing (stored NULL).
 */
function printFieldPresence(symbol: string, annual: AnnualFundamental[]): void {
  const latest = annual.at(-1);
  if (!latest) {
    console.log(`    fields[${symbol}]: no annual fundamentals returned`);
    return;
  }
  const fields: (keyof AnnualFundamental)[] = [
    "revenue", "operatingProfit", "netProfit", "totalDebt", "totalEquity",
    "totalAssets", "currentLiabilities", "operatingCashFlow", "interestExpense",
    "ebit", "dividendsPaid", "sharesOutstanding", "currentAssets", "grossProfit",
    "costOfRevenue", "retainedEarnings", "longTermDebt", "totalLiabilities",
  ];
  const cells = fields.map(
    (k) => `${k}=${latest[k] == null ? "—" : "·"}`,
  );
  console.log(`    fields[${symbol}] FY${latest.fiscalYear}: ${cells.join(" ")}`);
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

  // --- CLI args: controlled, quota-aware batching ---------------------------
  // --only SYM,SYM  fetch exactly these symbols (highest priority)
  // --limit N       cap the number of stocks fetched this run
  // Default order prioritizes the documented large-cap universe
  // (config/universe.ts, provenance: Nifty large-caps across sectors), then
  // the rest alphabetically. This keeps a controlled initial batch within the
  // provider's quota rather than fetching all 165 at once.
  const argv = process.argv.slice(2);
  const argVal = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const onlyArg = argVal("--only");
  const onlySet = onlyArg
    ? new Set(onlyArg.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean))
    : null;
  const limitArg = Number(argVal("--limit"));
  const limit = Number.isFinite(limitArg) && limitArg > 0 ? limitArg : null;

  // Active stocks.
  const { data: allStocks, error } = await db
    .from("stocks")
    .select("id, symbol, yahoo_symbol")
    .eq("is_active", true)
    .order("symbol");
  if (error) throw new Error(`read stocks: ${error.message}`);
  if (!allStocks || allStocks.length === 0) {
    console.log("No active stocks. Run `pnpm seed` first.");
    return;
  }

  // Priority ranking: documented large-cap universe first, then the rest.
  const priority = new Map(UNIVERSE.map((u, i) => [u.symbol, i]));
  const ranked = [...allStocks].sort((a, b) => {
    const pa = priority.has(a.symbol) ? priority.get(a.symbol)! : Number.MAX_SAFE_INTEGER;
    const pb = priority.has(b.symbol) ? priority.get(b.symbol)! : Number.MAX_SAFE_INTEGER;
    return pa !== pb ? pa - pb : a.symbol.localeCompare(b.symbol);
  });

  let stocks = onlySet
    ? ranked.filter((s) => onlySet.has(s.symbol.toUpperCase()))
    : ranked;
  if (limit) stocks = stocks.slice(0, limit);

  console.log(
    `Selected ${stocks.length}/${allStocks.length} active stocks` +
      (onlySet ? ` (--only)` : limit ? ` (--limit ${limit}, priority-ordered)` : ` (all)`) +
      `\n`,
  );

  // Active market-data provider (Tapetide when TAPETIDE_API_KEY is set,
  // otherwise the optional Yahoo fallback).
  const provider: MarketDataProvider = getProvider();
  console.log(`Provider: ${provider.name} (${provider.freshness})\n`);

  // Benchmark history (once) for beta.
  const since = new Date();
  since.setFullYear(since.getFullYear() - HISTORY_YEARS);

  let benchmarkReturns = new Map<string, number>();
  try {
    // Prefer the provider's native benchmark (Tapetide: nifty-50 index levels);
    // fall back to the Yahoo-symbol history path for providers without one.
    // Fetched ONCE here and reused for every stock's beta below.
    const benchBars = provider.getBenchmarkHistory
      ? await provider.getBenchmarkHistory(since)
      : await provider.getHistory(BENCHMARK_YAHOO_SYMBOL, since);
    benchmarkReturns = dailyReturnMap(
      benchBars.map((b) => ({ date: b.date, close: b.close })),
    );
    console.log(`✓ Benchmark (Nifty 50): ${benchBars.length} bars\n`);
  } catch (e) {
    // A rate-limit on the very first (benchmark) call means the quota is spent:
    // stop now instead of proceeding to 429 on every stock.
    if (e instanceof ProviderRateLimitError) {
      console.error(rateLimitMessage(e));
      process.exit(1);
    }
    // Other benchmark failures (e.g. a 404 index symbol) degrade to null beta.
    console.warn(`! Benchmark fetch failed — beta will be null. ${e}\n`);
  }

  const results: FetchResult[] = [];

  for (const stock of stocks) {
    // The provider adapter normalizes the symbol for its own API (Yahoo uses
    // `yahoo_symbol` with ".NS"; Tapetide strips the suffix). Pass the stored
    // yahoo_symbol when present, else the bare symbol.
    const providerSymbol = stock.yahoo_symbol ?? stock.symbol;

    try {
      // Incremental history: start the day after the latest stored bar.
      const last = await getLastPriceDate(stock.id);
      const period1 = last
        ? new Date(new Date(last).getTime() + 86400000)
        : since;

      const freshBars = await provider.getHistory(providerSymbol, period1);
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

      // Fundamentals (already INR crore per the provider contract).
      const annual = await provider.getAnnualFundamentals(providerSymbol);
      printFieldPresence(stock.symbol, annual);
      if (annual.length > 0) {
        const rows = annual.map((f) => ({
          ...toFundamentalRow(f),
          stock_id: stock.id,
        }));
        const { error: fErr } = await db
          .from("fundamentals_annual")
          .upsert(rows, { onConflict: "stock_id,fiscal_year" });
        if (fErr) throw new Error(`fundamentals upsert: ${fErr.message}`);
      }

      // Latest quote snapshot for price/valuation metrics.
      const quote = await provider.getQuote(providerSymbol);

      // --- Compute metrics (code only) ---
      const latest = annual.at(-1) ?? null;
      const revSeries = annual.map((a) => a.revenue);
      const profitSeries = annual.map((a) => a.netProfit);

      const revenueCagr3y = computeCagrFromSeries(revSeries, 3);
      const revenueCagr5y = computeCagrFromSeries(revSeries, 5);
      const profitCagr3y = computeCagrFromSeries(profitSeries, 3);
      const profitCagr5y = computeCagrFromSeries(profitSeries, 5);

      const pe = quote.pe;
      const pb = quote.pb;

      // Beta from aligned daily returns (code-computed). No provider-beta
      // fallback: when history is too short, beta stays null (not invented).
      const stockReturns = dailyReturnMap(series);
      const aligned = alignReturns(stockReturns, benchmarkReturns);
      const beta = computeBeta(aligned.stock, aligned.market);

      // Prefer the quote's 52-week range; fall back to the close series.
      const week52FromSeries = compute52Week(closes);
      const week52 = {
        high: quote.week52High ?? week52FromSeries.high,
        low: quote.week52Low ?? week52FromSeries.low,
      };

      // 3y drawdown: last ~3*252 closes.
      const dd3y = computeMaxDrawdown(closes.slice(-(3 * 252)));

      // Dividend yield (already a percent per the provider contract).
      const dividendYield = quote.dividendYield;

      const metrics: TablesInsert<"stock_metrics"> = {
        stock_id: stock.id,
        as_of: new Date().toISOString().slice(0, 10),
        price: quote.price ?? (closes.at(-1) ?? null),
        prev_close: quote.prevClose,
        market_cap: quote.marketCapCrore,
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

      // If the provider is rate-limiting us, STOP the run rather than hammering
      // the remaining symbols (which only worsens throttling). Existing valid
      // data is untouched because the failed stock was never upserted.
      if (e instanceof ProviderRateLimitError) {
        console.error(rateLimitMessage(e));
        break;
      }
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

  // Fail loudly if more than 30% of stocks failed to fetch (nightly CI gate).
  const failRate = results.length > 0 ? failed / results.length : 0;
  if (failRate > 0.3) {
    console.error(
      `\n✗ ${(failRate * 100).toFixed(0)}% of stocks failed to fetch (> 30% threshold).`,
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
