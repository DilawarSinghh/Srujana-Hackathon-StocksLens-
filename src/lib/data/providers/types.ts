import type { DailyBar, AnnualFundamental } from "@/lib/data/yahoo";

/**
 * Provider-neutral market-data contract. The ingestion pipeline depends on this
 * interface, not on any one provider's response shape. New providers implement
 * it; `fetch-market-data.ts` selects one at runtime.
 *
 * Reuses the existing `DailyBar` / `AnnualFundamental` shapes so the database
 * contract, scoring engine, and risk engine are unchanged.
 */

/**
 * Latest available price snapshot. Provider-sourced valuation fields only;
 * code-computed ratios (ROE, CAGR, volatility…) are derived downstream.
 * Every field is nullable — a missing figure stays null, never 0 or invented.
 */
export interface QuoteSnapshot {
  price: number | null;
  prevClose: number | null;
  /** Market capitalisation in INR crore. */
  marketCapCrore: number | null;
  pe: number | null;
  pb: number | null;
  /** Dividend yield as a percent (e.g. 1.5 = 1.5%). */
  dividendYield: number | null;
  week52High: number | null;
  week52Low: number | null;
  /** Provider's data timestamp (ISO), if supplied. */
  asOf: string | null;
  /** Reporting currency (e.g. "INR"), if supplied. */
  currency: string | null;
}

/**
 * A listed-equity directory entry (provider instrument reference). Discovery
 * only — the presence of an entry says nothing about price/fundamental
 * availability. Fields a provider does not supply are null.
 */
export interface ReferenceStock {
  /** Provider's canonical symbol used in per-stock routes. */
  symbol: string;
  name: string;
  isin: string | null;
  nseSymbol: string | null;
  bseCode: string | null;
  listedOn: string[];
  status: "active" | "delisted" | "inactive";
  /** Primary exchange derived from listing data ("NSE"/"BSE"). */
  exchange: string | null;
  sector: string | null;
  industry: string | null;
}

/** Options for a paginated master-list discovery call. */
export interface DiscoverOptions {
  /** Max instruments to return (caller stops paginating once reached). */
  limit: number;
  /** Only this listing status (default: active). */
  status?: "active" | "delisted" | "inactive";
}

export interface MarketDataProvider {
  /** Stable provider id for logging/provenance. */
  readonly name: string;
  /** Human label for how fresh the data is (e.g. "end-of-day"). */
  readonly freshness: "real-time" | "delayed" | "end-of-day";

  /** Daily OHLCV from `since` to now, chronological. INR, split/bonus adjusted. */
  getHistory(symbol: string, since: Date): Promise<DailyBar[]>;

  /** Annual fundamentals (INR crore where monetary). Missing fields are null. */
  getAnnualFundamentals(symbol: string): Promise<AnnualFundamental[]>;

  /** Latest available quote snapshot. */
  getQuote(symbol: string): Promise<QuoteSnapshot>;

  /**
   * Discover listed instruments from the provider's master list (optional —
   * not every provider supports bulk discovery). Paginated by the adapter.
   */
  getReferenceStocks?(opts: DiscoverOptions): Promise<ReferenceStock[]>;

  /**
   * Daily history for the market benchmark used in beta (optional). Returns the
   * benchmark's close series as DailyBars. Null/empty when the provider has no
   * benchmark source — beta then stays null (never fabricated).
   */
  getBenchmarkHistory?(since: Date): Promise<DailyBar[]>;
}

/** Raised when a provider is rate-limited after exhausting retries. */
export class ProviderRateLimitError extends Error {
  constructor(provider: string, label: string) {
    super(`${provider}: rate limited (HTTP 429) on ${label} after retries`);
    this.name = "ProviderRateLimitError";
  }
}
