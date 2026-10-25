import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { TapetideProvider } from "./tapetide";
import { ProviderRateLimitError } from "./types";

/**
 * 429 / quota handling for the Tapetide adapter, using a mocked global.fetch.
 * No real network. The long-retry cases assert we ABORT immediately (no
 * multi-hour sleep) rather than honoring a huge Retry-After.
 */

const TOKEN = "tpt_rt_test";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function rateLimited(retryAfterSec?: number): Response {
  const headers: Record<string, string> = {};
  if (retryAfterSec != null) headers["retry-after"] = String(retryAfterSec);
  return new Response(JSON.stringify({ error: { code: "quota_exhausted", message: "429" } }), {
    status: 429,
    headers,
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  // Low cap so the "within cap" retry sleeps are near-instant in tests.
  process.env.TAPETIDE_MAX_RETRY_MS = "1500";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.TAPETIDE_MAX_RETRY_MS;
});

describe("TapetideProvider 429 handling", () => {
  it("aborts immediately with ProviderRateLimitError when Retry-After exceeds the cap", async () => {
    // Huge Retry-After (daily reset) -> must NOT sleep; throw at once.
    fetchMock.mockResolvedValue(rateLimited(42845));
    const p = new TapetideProvider(TOKEN);

    const started = Date.now();
    await expect(p.getQuote("RELIANCE")).rejects.toBeInstanceOf(ProviderRateLimitError);
    const elapsed = Date.now() - started;

    // Should fail fast (well under the 42845s the header requested, and under
    // even a few seconds).
    expect(elapsed).toBeLessThan(2000);
    // Only one request was made — we did not retry a hopeless quota reset.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("carries retryAfterSec on the error for an actionable message", async () => {
    fetchMock.mockResolvedValue(rateLimited(3600));
    const p = new TapetideProvider(TOKEN);
    try {
      await p.getQuote("TCS");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ProviderRateLimitError);
      expect((e as ProviderRateLimitError).retryAfterSec).toBe(3600);
      expect((e as ProviderRateLimitError).message).toContain("3600");
    }
  });

  it("retries a short 429 (within cap) then succeeds", async () => {
    // First a 429 with a tiny Retry-After (within the 1500ms cap), then OK.
    fetchMock
      .mockResolvedValueOnce(rateLimited(1)) // 1s <= 1.5s cap -> wait + retry
      .mockResolvedValueOnce(jsonResponse({ data: { price: 100 }, meta: {} }));
    const p = new TapetideProvider(TOKEN);

    const q = await p.getQuote("INFY");
    expect(q.price).toBe(100);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("aborts when a short 429 persists past all attempts", async () => {
    // Always 429 with a within-cap delay -> retries, then ProviderRateLimitError.
    fetchMock.mockResolvedValue(rateLimited(1));
    const p = new TapetideProvider(TOKEN);
    await expect(p.getQuote("SBIN")).rejects.toBeInstanceOf(ProviderRateLimitError);
    // 4 attempts total (the adapter's bound).
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

describe("beta refresh computation (stored prices + one benchmark)", () => {
  // Mirrors scripts/refresh-beta.ts: benchmark returns + stored stock closes
  // -> aligned returns -> computeBeta. Deterministic, no network.
  it("recomputes a finite beta from overlapping stored prices", async () => {
    const { alignReturns, computeBeta } = await import("@/lib/data/metrics");
    // Varying benchmark returns; stock return = exactly 2x the benchmark each
    // day -> beta = 2 (needs varying returns; constant series has zero variance).
    const dates = ["2024-01-01", "2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05"];
    const benchDailyRet = [0.01, -0.005, 0.02, -0.01]; // one per day after the first
    const benchReturns = new Map<string, number>();
    const stockReturns = new Map<string, number>();
    for (let i = 0; i < benchDailyRet.length; i++) {
      benchReturns.set(dates[i + 1], benchDailyRet[i]);
      stockReturns.set(dates[i + 1], benchDailyRet[i] * 2);
    }
    const aligned = alignReturns(stockReturns, benchReturns);
    const beta = computeBeta(aligned.stock, aligned.market);
    expect(beta).toBeCloseTo(2, 6);
  });

  it("leaves beta null when overlap is insufficient (never fabricated)", async () => {
    const { dailyReturnMap, alignReturns, computeBeta } = await import("@/lib/data/metrics");
    // Benchmark and stock share no common dates -> no overlap -> null.
    const bench = dailyReturnMap([
      { date: "2024-01-01", close: 100 },
      { date: "2024-01-02", close: 101 },
    ]);
    const stock = dailyReturnMap([
      { date: "2023-06-01", close: 50 },
      { date: "2023-06-02", close: 51 },
    ]);
    const aligned = alignReturns(stock, bench);
    expect(computeBeta(aligned.stock, aligned.market)).toBeNull();
  });
});

describe("TapetideProvider benchmark reuse", () => {
  it("getBenchmarkHistory makes a single request for a one-page result", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: [
          { date: "2024-01-01", open: 100, high: 101, low: 99, close: 100, volume: 1 },
          { date: "2024-01-02", open: 100, high: 102, low: 99, close: 101, volume: 1 },
        ],
        meta: { next_cursor: null },
      }),
    );
    const p = new TapetideProvider(TOKEN);
    const bars = await p.getBenchmarkHistory(new Date("2023-01-01"));

    expect(bars).toHaveLength(2);
    // Exactly one benchmark request (no per-bar or repeated calls).
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("/indices/nifty-50/levels");
  });
});
