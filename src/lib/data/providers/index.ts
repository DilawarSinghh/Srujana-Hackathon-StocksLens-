import {
  getHistory as yahooGetHistory,
  getAnnualFundamentals as yahooGetAnnualFundamentals,
  getQuoteSummary as yahooGetQuoteSummary,
  YahooRateLimitError,
  type DailyBar,
  type AnnualFundamental,
} from "@/lib/data/yahoo";
import {
  type MarketDataProvider,
  type QuoteSnapshot,
  ProviderRateLimitError,
} from "./types";
import { TapetideProvider } from "./tapetide";

export type {
  MarketDataProvider,
  QuoteSnapshot,
  ReferenceStock,
  DiscoverOptions,
} from "./types";
export { ProviderRateLimitError } from "./types";

/** Translate the Yahoo adapter's rate-limit error into the neutral one. */
async function mapYahooRateLimit<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof YahooRateLimitError) {
      throw new ProviderRateLimitError("yahoo", label);
    }
    throw e;
  }
}

/**
 * Yahoo-backed provider — wraps the existing adapter so the ingestion pipeline
 * can treat Yahoo as just one implementation of MarketDataProvider. Kept as an
 * OPTIONAL fallback; Yahoo is no longer a required dependency.
 */
class YahooProvider implements MarketDataProvider {
  readonly name = "yahoo";
  readonly freshness = "delayed" as const;

  getHistory(symbol: string, since: Date): Promise<DailyBar[]> {
    return mapYahooRateLimit("history", () => yahooGetHistory(symbol, since));
  }

  /** Nifty 50 via Yahoo's ^NSEI chart (existing behavior). */
  getBenchmarkHistory(since: Date): Promise<DailyBar[]> {
    return mapYahooRateLimit("benchmark", () => yahooGetHistory("^NSEI", since));
  }

  async getAnnualFundamentals(symbol: string): Promise<AnnualFundamental[]> {
    // Yahoo returns absolute INR; the provider contract is INR crore. Convert
    // monetary fields here (1 crore = 1e7). shares_outstanding is a count.
    const raw = await mapYahooRateLimit("fundamentals", () =>
      yahooGetAnnualFundamentals(symbol),
    );
    const c = (v: number | null) => (v == null ? null : v / 1e7);
    return raw.map((f) => ({
      fiscalYear: f.fiscalYear,
      revenue: c(f.revenue),
      operatingProfit: c(f.operatingProfit),
      netProfit: c(f.netProfit),
      totalDebt: c(f.totalDebt),
      totalEquity: c(f.totalEquity),
      totalAssets: c(f.totalAssets),
      currentLiabilities: c(f.currentLiabilities),
      operatingCashFlow: c(f.operatingCashFlow),
      interestExpense: c(f.interestExpense),
      ebit: c(f.ebit),
      dividendsPaid: c(f.dividendsPaid),
      sharesOutstanding: f.sharesOutstanding,
      currentAssets: c(f.currentAssets),
      grossProfit: c(f.grossProfit),
      costOfRevenue: c(f.costOfRevenue),
      retainedEarnings: c(f.retainedEarnings),
      longTermDebt: c(f.longTermDebt),
      totalLiabilities: c(f.totalLiabilities),
    }));
  }

  async getQuote(symbol: string): Promise<QuoteSnapshot> {
    const s = await yahooGetQuoteSummary(symbol);
    const divFrac = s.summaryDetail?.dividendYield ?? null;
    const marketCap = s.price?.marketCap ?? null;
    return {
      price: s.price?.regularMarketPrice ?? s.financialData?.currentPrice ?? null,
      prevClose: s.price?.regularMarketPreviousClose ?? null,
      // Yahoo market cap is absolute INR; convert to crore (1 crore = 1e7).
      marketCapCrore: marketCap != null ? marketCap / 1e7 : null,
      pe: s.summaryDetail?.trailingPE ?? null,
      pb:
        s.summaryDetail?.priceToBook ??
        s.defaultKeyStatistics?.priceToBook ??
        null,
      dividendYield: divFrac != null ? divFrac * 100 : null,
      week52High: s.summaryDetail?.fiftyTwoWeekHigh ?? null,
      week52Low: s.summaryDetail?.fiftyTwoWeekLow ?? null,
      asOf: null,
      currency: null,
    };
  }
}

/**
 * Select the active market-data provider from env. Prefers Tapetide when
 * `TAPETIDE_API_KEY` is set; otherwise falls back to the optional Yahoo path.
 * The choice is made once, in the ingestion script — the rest of the pipeline
 * only sees the MarketDataProvider interface.
 */
export function getProvider(): MarketDataProvider {
  const token = process.env.TAPETIDE_API_KEY;
  if (token && token.trim() && token !== "your-tapetide-token") {
    return new TapetideProvider(token.trim());
  }
  return new YahooProvider();
}
