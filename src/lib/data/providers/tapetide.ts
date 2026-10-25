import type { DailyBar, AnnualFundamental } from "@/lib/data/yahoo";
import {
  type MarketDataProvider,
  type QuoteSnapshot,
  ProviderRateLimitError,
} from "./types";
import {
  parseDailyPrices,
  parseFundamentals,
  parseQuote,
  parseReferenceStocks,
} from "./tapetide-parse";
import type { DiscoverOptions, ReferenceStock } from "./types";

/**
 * Tapetide provider (https://developers.tapetide.com). NSE/BSE, INR, JSON
 * `{ data, meta }`. End-of-day prices (last-session close outside market
 * hours). Requires a bearer token in `TAPETIDE_API_KEY` — server/scripts only.
 *
 * All requests are 429-aware (bounded retries, jitter, honoring `Retry-After`)
 * and gentle so retries do not worsen throttling. A missing figure stays null;
 * nothing is fabricated.
 */

const BASE = "https://api.tapetide.com/v1";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Longest a 429 `Retry-After` we will actually wait for inside a CLI run.
 * Beyond this (e.g. a quota_exhausted reset many hours out) we abort with an
 * actionable error instead of blocking the process. Override with
 * TAPETIDE_MAX_RETRY_MS. Default 60s.
 */
function maxRetryMs(): number {
  const v = Number(process.env.TAPETIDE_MAX_RETRY_MS);
  return Number.isFinite(v) && v > 0 ? v : 60_000;
}

/** Tapetide uses the bare NSE symbol (e.g. "RELIANCE"), not "RELIANCE.NS". */
export function toTapetideSymbol(symbol: string): string {
  return symbol.replace(/\.(NS|BO|BSE|NSE)$/i, "").toUpperCase();
}

export class TapetideProvider implements MarketDataProvider {
  readonly name = "tapetide";
  readonly freshness = "end-of-day" as const;

  constructor(private readonly token: string) {
    if (!token) throw new Error("TapetideProvider requires an API token");
  }

  /**
   * GET an envelope route with bounded, 429-aware backoff.
   *
   * On HTTP 429/503 we honor `Retry-After` — BUT only wait when the delay is
   * within `maxRetryMs()`. A long delay (quota_exhausted resets hours out)
   * aborts immediately with `ProviderRateLimitError` carrying the retry-after,
   * so an interactive CLI never blocks for hours.
   */
  private async get(
    path: string,
    label: string,
    attempts = 4,
  ): Promise<{ data: unknown; meta: Record<string, unknown> }> {
    const cap = maxRetryMs();
    let backoff = 2000;
    for (let i = 0; i < attempts; i++) {
      let res: Response;
      try {
        res = await fetch(`${BASE}${path}`, {
          headers: {
            authorization: `Bearer ${this.token}`,
            accept: "application/json",
          },
        });
      } catch (e) {
        if (i === attempts - 1) throw e;
        await sleep(Math.min(backoff + Math.random() * 500, cap));
        backoff = Math.min(backoff * 2, 20000);
        continue;
      }

      if (res.status === 429 || res.status === 503) {
        const retryAfterSec = Number(res.headers.get("retry-after"));
        const hasRetryAfter = Number.isFinite(retryAfterSec) && retryAfterSec > 0;
        const waitMs = hasRetryAfter
          ? retryAfterSec * 1000
          : backoff + Math.random() * 500;

        // Required wait too long to block a CLI on (e.g. daily quota reset):
        // abort now with an actionable error instead of sleeping for hours.
        if (waitMs > cap) {
          throw new ProviderRateLimitError(
            this.name,
            label,
            hasRetryAfter ? Math.round(retryAfterSec) : null,
          );
        }
        if (i < attempts - 1) {
          console.warn(
            `  ${label}: HTTP ${res.status}, waiting ${Math.round(waitMs)}ms`,
          );
          await sleep(waitMs);
          backoff = Math.min(backoff * 2, 20000);
          continue;
        }
        // Out of attempts while still throttled.
        throw new ProviderRateLimitError(
          this.name,
          label,
          hasRetryAfter ? Math.round(retryAfterSec) : null,
        );
      }

      const text = await res.text();
      if (res.status === 404) {
        // Resource genuinely absent — distinct from a transient failure.
        throw new Error(`${label}: 404 not found`);
      }
      if (!res.ok) {
        throw new Error(`${label}: HTTP ${res.status} ${text.slice(0, 160)}`);
      }
      try {
        const json = JSON.parse(text) as {
          data: unknown;
          meta?: Record<string, unknown>;
        };
        return { data: json.data, meta: json.meta ?? {} };
      } catch {
        throw new Error(`${label}: non-JSON response ${text.slice(0, 80)}`);
      }
    }
    throw new Error(`${label}: failed after ${attempts} attempts`);
  }

  async getHistory(symbol: string, since: Date): Promise<DailyBar[]> {
    const sym = encodeURIComponent(toTapetideSymbol(symbol));
    const from = since.toISOString().slice(0, 10);
    const to = new Date().toISOString().slice(0, 10);
    const all: DailyBar[] = [];
    let cursor: string | null = null;
    // Paginate via meta.next_cursor. Bounded to avoid runaway loops.
    for (let page = 0; page < 50; page++) {
      const q = new URLSearchParams({ from, to, order: "asc", limit: "5000" });
      if (cursor) q.set("cursor", cursor);
      const { data, meta } = await this.get(
        `/stocks/${sym}/prices/daily?${q.toString()}`,
        `history ${symbol} p${page}`,
      );
      all.push(...parseDailyPrices(data));
      cursor = typeof meta.next_cursor === "string" ? meta.next_cursor : null;
      if (!cursor) break;
    }
    // De-duplicate by date, chronological.
    const byDate = new Map<string, DailyBar>();
    for (const b of all) byDate.set(b.date, b);
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  async getAnnualFundamentals(symbol: string): Promise<AnnualFundamental[]> {
    const sym = encodeURIComponent(toTapetideSymbol(symbol));
    const all: unknown[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 50; page++) {
      const q = new URLSearchParams({
        period_type: "annual",
        order: "asc",
        limit: "1000",
      });
      if (cursor) q.set("cursor", cursor);
      const { data, meta } = await this.get(
        `/stocks/${sym}/fundamentals?${q.toString()}`,
        `fundamentals ${symbol} p${page}`,
      );
      if (Array.isArray(data)) all.push(...data);
      cursor = typeof meta.next_cursor === "string" ? meta.next_cursor : null;
      if (!cursor) break;
    }
    return parseFundamentals(all);
  }

  async getQuote(symbol: string): Promise<QuoteSnapshot> {
    const sym = encodeURIComponent(toTapetideSymbol(symbol));
    const { data } = await this.get(`/stocks/${sym}/quote`, `quote ${symbol}`);
    return parseQuote(data);
  }

  /**
   * Benchmark (Nifty 50) daily levels via GET /v1/indices/nifty-50/levels. The
   * response rows share the daily-bar shape (date/open/high/low/close), so the
   * existing parser is reused. Paginated by cursor.
   */
  async getBenchmarkHistory(since: Date): Promise<DailyBar[]> {
    const from = since.toISOString().slice(0, 10);
    const to = new Date().toISOString().slice(0, 10);
    const all: DailyBar[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 50; page++) {
      const q = new URLSearchParams({ from, to, order: "asc", limit: "1000" });
      if (cursor) q.set("cursor", cursor);
      const { data, meta } = await this.get(
        `/indices/nifty-50/levels?${q.toString()}`,
        `benchmark nifty-50 p${page}`,
      );
      all.push(...parseDailyPrices(data));
      cursor = typeof meta.next_cursor === "string" ? meta.next_cursor : null;
      if (!cursor) break;
    }
    const byDate = new Map<string, DailyBar>();
    for (const b of all) byDate.set(b.date, b);
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Discover listed instruments from GET /v1/reference/stocks. Paginates via
   * meta.next_cursor and stops once `limit` instruments are collected. Each
   * page is 1 request unit; 100–200 stocks is 1 page (page size up to 1000).
   */
  async getReferenceStocks(opts: DiscoverOptions): Promise<ReferenceStock[]> {
    const status = opts.status ?? "active";
    const pageSize = Math.min(Math.max(opts.limit, 1), 1000);
    const all: ReferenceStock[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 50 && all.length < opts.limit; page++) {
      const q = new URLSearchParams({ status, limit: String(pageSize) });
      if (cursor) q.set("cursor", cursor);
      const { data, meta } = await this.get(
        `/reference/stocks?${q.toString()}`,
        `reference stocks p${page}`,
      );
      all.push(...parseReferenceStocks(data));
      cursor = typeof meta.next_cursor === "string" ? meta.next_cursor : null;
      if (!cursor) break;
    }
    return all.slice(0, opts.limit);
  }
}
