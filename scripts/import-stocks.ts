/**
 * Discover and import the Indian stock universe from the market-data provider's
 * master list (Tapetide `GET /v1/reference/stocks`).
 *
 *   pnpm import:stocks -- --limit 150            # import up to 150 active stocks
 *   pnpm import:stocks -- --limit 200 --dry-run  # report only, no DB writes
 *   pnpm import:stocks -- --status active
 *
 * Discovery ONLY. Importing a symbol does NOT fetch prices/fundamentals or
 * compute a score — run `pnpm fetch` / `pnpm score` separately for that. New
 * rows have is_active=true so they appear in Explore/search immediately, with
 * "Not available" everywhere until their market data is fetched.
 *
 * Idempotent: upserts on the stocks.symbol unique constraint, so existing stock
 * IDs and all relationships (holdings, scores, filings…) are preserved.
 */
import { db } from "./lib/db";
import { getProvider, type ReferenceStock } from "@/lib/data/providers";
import { toYahooSymbol } from "@/config/universe";
import type { TablesInsert } from "@/types/database";

interface Args {
  limit: number;
  status: "active" | "delisted" | "inactive";
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const rawLimit = Number(get("--limit") ?? 150);
  // Keep the default batch in the validated 1–200 range (per the brief: do not
  // import thousands until the pipeline is validated).
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 150, 1), 200);
  const statusArg = get("--status");
  const status =
    statusArg === "delisted" || statusArg === "inactive" ? statusArg : "active";
  return { limit, status, dryRun: argv.includes("--dry-run") };
}

/** Map a provider ReferenceStock to a stocks-table insert (existing columns only). */
function toStockRow(r: ReferenceStock): TablesInsert<"stocks"> {
  // yahoo_symbol only when an NSE symbol exists (verified ".NS" mapping) so the
  // optional Yahoo fallback provider still resolves it; null otherwise.
  const yahoo = r.nseSymbol ? toYahooSymbol(r.nseSymbol) : null;
  return {
    symbol: r.symbol,
    name: r.name,
    exchange: r.exchange,
    yahoo_symbol: yahoo,
    sector: r.sector,
    industry: r.industry,
    cap_category: null, // unknown from the reference list — never invented
    currency: "INR",
    country: "IN",
    is_active: r.status === "active",
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(
    `Importing stocks (limit=${args.limit}, status=${args.status}, dryRun=${args.dryRun})\n`,
  );

  const provider = getProvider();
  if (typeof provider.getReferenceStocks !== "function") {
    console.error(
      `✗ Provider "${provider.name}" does not support stock discovery. ` +
        `Set TAPETIDE_API_KEY to use Tapetide's reference-stocks endpoint.`,
    );
    process.exit(1);
  }
  console.log(`Provider: ${provider.name}\n`);

  // --- Discover (bulk, paginated) ---
  let discovered: ReferenceStock[];
  try {
    discovered = await provider.getReferenceStocks({
      limit: args.limit,
      status: args.status,
    });
  } catch (e) {
    console.error(`✗ Discovery failed: ${(e as Error).message}`);
    process.exit(1);
  }
  console.log(`Discovered: ${discovered.length} instruments`);

  // --- Eligibility filter + de-duplicate by symbol ---
  const seen = new Set<string>();
  const eligible: ReferenceStock[] = [];
  let skippedNoExchange = 0;
  let duplicates = 0;
  for (const r of discovered) {
    if (!r.exchange) {
      skippedNoExchange++;
      continue; // cannot map to an exchange identity
    }
    if (seen.has(r.symbol)) {
      duplicates++;
      continue;
    }
    seen.add(r.symbol);
    eligible.push(r);
  }
  console.log(
    `Eligible: ${eligible.length} (skipped ${skippedNoExchange} without an exchange, ` +
      `${duplicates} duplicates)`,
  );

  // Which are already in the DB (preserved, updated in place)?
  const symbols = eligible.map((r) => r.symbol);
  const { data: existing } = await db
    .from("stocks")
    .select("symbol")
    .in("symbol", symbols);
  const existingSet = new Set((existing ?? []).map((s) => s.symbol));
  const newCount = eligible.filter((r) => !existingSet.has(r.symbol)).length;
  console.log(
    `Of eligible: ${existingSet.size} already exist (will update), ${newCount} new`,
  );

  if (args.dryRun) {
    console.log(`\n[dry-run] Would upsert ${eligible.length} rows. No DB writes made.`);
    printSample(eligible);
    return;
  }

  // --- Upsert (idempotent, preserves existing IDs via onConflict: symbol) ---
  const rows = eligible.map(toStockRow);
  const CHUNK = 500;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await db
      .from("stocks")
      .upsert(slice, { onConflict: "symbol" });
    if (error) {
      console.error(`✗ Upsert failed at chunk ${i / CHUNK}: ${error.message}`);
      process.exit(1);
    }
    upserted += slice.length;
  }

  console.log(`\n✓ Upserted ${upserted} stocks (${newCount} new, ${existingSet.size} updated).`);
  printSample(eligible);
  console.log(
    `\nNext: run \`pnpm fetch\` then \`pnpm score\` to populate prices, ` +
      `fundamentals and scores for the imported universe. Imported stocks have ` +
      `NO market data or score until then.`,
  );
}

function printSample(rows: ReferenceStock[]) {
  const sample = rows.slice(0, 5);
  if (sample.length === 0) return;
  console.log("\nSample:");
  for (const r of sample) {
    console.log(
      `  ${r.symbol.padEnd(14)} ${r.exchange ?? "?"}  ${(r.sector ?? "—").padEnd(24)} ${r.name}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
