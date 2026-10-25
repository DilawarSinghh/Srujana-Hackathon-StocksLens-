/**
 * Classify every active stock into a market-cap band (large/mid/small) from its
 * sourced market capitalisation, and write the result to stocks.cap_category.
 *
 *   pnpm classify:caps            # apply the classification
 *   pnpm classify:caps -- --dry-run
 *
 * This is the step that makes the Large/Mid/Small Explorer tabs work for the
 * imported universe: `import:stocks` leaves cap_category NULL (never guessed),
 * and `fetch` populates market_cap; this script turns market_cap into a band
 * using the documented rank methodology (src/lib/data/cap-classification.ts).
 *
 * It is an internally-calculated APPROXIMATION over the SUPPORTED universe, not
 * the official AMFI/SEBI list. Stocks with no market cap are set to NULL
 * (unavailable) — never guessed. Idempotent: only writes cap_category, so it is
 * safe to re-run after each `fetch`.
 */
import { db } from "./lib/db";
import { classifyUniverse, type CapInput } from "@/lib/data/cap-classification";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`Classifying market-cap bands${dryRun ? " (dry-run)" : ""}…\n`);

  // Active stocks + their latest market cap (from stock_metrics).
  const { data: stocks, error } = await db
    .from("stocks")
    .select("id, symbol, cap_category")
    .eq("is_active", true);
  if (error) throw new Error(`read stocks: ${error.message}`);
  if (!stocks || stocks.length === 0) {
    console.log("No active stocks. Run `pnpm import:stocks` / `pnpm seed` first.");
    return;
  }

  const { data: metrics, error: mErr } = await db
    .from("stock_metrics")
    .select("stock_id, market_cap");
  if (mErr) throw new Error(`read metrics: ${mErr.message}`);
  const capById = new Map((metrics ?? []).map((m) => [m.stock_id, m.market_cap]));

  const input: CapInput[] = stocks.map((s) => ({
    stockId: s.id,
    marketCapCrore: capById.get(s.id) ?? null,
  }));

  const results = classifyUniverse(input);
  const prevById = new Map(stocks.map((s) => [s.id, s.cap_category]));

  const counts = { large: 0, mid: 0, small: 0, unavailable: 0, changed: 0 };
  for (const r of results) {
    if (r.cap === "large") counts.large++;
    else if (r.cap === "mid") counts.mid++;
    else if (r.cap === "small") counts.small++;
    else counts.unavailable++;
    if ((prevById.get(r.stockId) ?? null) !== r.cap) counts.changed++;
  }

  console.log(
    `Universe: ${stocks.length} active · eligible (has market cap): ${
      stocks.length - counts.unavailable
    }`,
  );
  console.log(
    `Bands → large: ${counts.large}, mid: ${counts.mid}, small: ${counts.small}, ` +
      `unavailable: ${counts.unavailable}`,
  );
  console.log(`Changes vs current cap_category: ${counts.changed}\n`);

  if (dryRun) {
    console.log("[dry-run] No DB writes made.");
    return;
  }

  // Update cap_category only. Batched; preserves every other column + all
  // relationships (holdings, scores, filings…).
  let updated = 0;
  for (const r of results) {
    if ((prevById.get(r.stockId) ?? null) === r.cap) continue; // no-op
    const { error: uErr } = await db
      .from("stocks")
      .update({ cap_category: r.cap })
      .eq("id", r.stockId);
    if (uErr) {
      console.error(`✗ ${r.stockId}: ${uErr.message}`);
      continue;
    }
    updated++;
  }

  console.log(`✓ Updated cap_category for ${updated} stocks.`);
  console.log(
    `\nNote: this is an internally-calculated approximation over the supported ` +
      `universe, not the official AMFI/SEBI classification.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
