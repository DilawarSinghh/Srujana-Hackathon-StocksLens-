/**
 * Refresh per-stock beta from STORED prices + a single benchmark fetch.
 *
 *   pnpm refresh:beta                      # all stocks with stored prices
 *   pnpm refresh:beta -- --only RELIANCE,TCS
 *
 * Why this exists: beta = cov(stock, benchmark) / var(benchmark) over aligned
 * daily returns. The stock price history is already stored, so recomputing beta
 * needs only ONE benchmark request per run — not a full re-fetch of every
 * stock's history/quote/fundamentals. Useful after the benchmark integration
 * landed (previously-fetched stocks had null beta).
 *
 * Safety:
 *  - Fetches the benchmark ONCE and reuses it for every stock.
 *  - Updates ONLY stock_metrics.beta — never touches other metric columns.
 *  - Leaves beta NULL when overlap is insufficient or benchmark variance is 0
 *    (never fabricates a value).
 *  - Idempotent and safe to rerun. Aborts cleanly on provider rate-limit.
 */
import { db } from "./lib/db";
import { UNIVERSE } from "@/config/universe";
import { getProvider, ProviderRateLimitError } from "@/lib/data/providers";
import {
  dailyReturnMap,
  alignReturns,
  computeBeta,
} from "@/lib/data/metrics";

const HISTORY_YEARS = 5;

async function loadCloses(stockId: string): Promise<{ date: string; close: number | null }[]> {
  const out: { date: string; close: number | null }[] = [];
  let from = 0;
  for (;;) {
    const { data } = await db
      .from("price_history")
      .select("date, close")
      .eq("stock_id", stockId)
      .order("date", { ascending: true })
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return out;
}

async function main() {
  const argv = process.argv.slice(2);
  const onlyArg = argv[argv.indexOf("--only") + 1];
  const onlySet =
    argv.includes("--only") && onlyArg
      ? new Set(onlyArg.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean))
      : null;

  const provider = getProvider();
  if (!provider.getBenchmarkHistory) {
    console.error(`✗ Provider "${provider.name}" has no benchmark source; cannot refresh beta.`);
    process.exit(1);
  }

  // Benchmark ONCE.
  const since = new Date();
  since.setFullYear(since.getFullYear() - HISTORY_YEARS);
  let benchmarkReturns: Map<string, number>;
  try {
    const bars = await provider.getBenchmarkHistory(since);
    benchmarkReturns = dailyReturnMap(bars.map((b) => ({ date: b.date, close: b.close })));
    console.log(`✓ Benchmark (Nifty 50): ${bars.length} bars\n`);
  } catch (e) {
    if (e instanceof ProviderRateLimitError) {
      console.error(`✗ Benchmark rate-limited (HTTP 429). Re-run after the quota resets.`);
      process.exit(1);
    }
    console.error(`✗ Benchmark fetch failed: ${(e as Error).message}`);
    process.exit(1);
  }
  if (benchmarkReturns.size < 2) {
    console.error("✗ Benchmark returned too few observations; aborting (beta left unchanged).");
    process.exit(1);
  }

  // Candidate stocks: those with stored price history.
  const priority = new Map(UNIVERSE.map((u, i) => [u.symbol, i]));
  const { data: stocks } = await db.from("stocks").select("id, symbol").eq("is_active", true);
  const selected = (stocks ?? [])
    .filter((s) => (onlySet ? onlySet.has(s.symbol.toUpperCase()) : true))
    .sort((a, b) =>
      (priority.get(a.symbol) ?? 1e9) - (priority.get(b.symbol) ?? 1e9) ||
      a.symbol.localeCompare(b.symbol),
    );

  let updated = 0, nulled = 0, skipped = 0;
  for (const s of selected) {
    const closes = await loadCloses(s.id);
    if (closes.length < 2) {
      skipped++;
      continue; // no stored prices -> nothing to recompute from
    }
    const stockReturns = dailyReturnMap(closes);
    const aligned = alignReturns(stockReturns, benchmarkReturns);
    const beta = computeBeta(aligned.stock, aligned.market); // null if insufficient/zero-var

    // Update ONLY the beta column; leave every other metric untouched.
    const { error } = await db
      .from("stock_metrics")
      .update({ beta })
      .eq("stock_id", s.id);
    if (error) {
      console.error(`✗ ${s.symbol}: update failed — ${error.message}`);
      continue;
    }
    if (beta == null) {
      nulled++;
      console.log(`• ${s.symbol}: beta null (overlap ${aligned.stock.length} days — insufficient/zero-variance)`);
    } else {
      updated++;
      console.log(`✓ ${s.symbol}: beta ${beta.toFixed(3)} (overlap ${aligned.stock.length} days)`);
    }
  }

  console.log(`\nBeta refresh done: ${updated} set, ${nulled} left null, ${skipped} skipped (no stored prices).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
