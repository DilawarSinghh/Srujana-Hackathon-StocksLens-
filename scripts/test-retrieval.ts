/**
 * Test filing retrieval for a symbol + question.
 *
 *   pnpm tsx scripts/test-retrieval.ts RELIANCE "What are the key risks?"
 */
import "./lib/db"; // loads env
import { createAdminClient } from "@/lib/supabase/admin";
import { retrieveChunks } from "@/lib/rag/retrieve";

async function main() {
  const symbol = process.argv[2];
  const question = process.argv.slice(3).join(" ");
  if (!symbol || !question) {
    console.log('Usage: pnpm tsx scripts/test-retrieval.ts <SYMBOL> "<question>"');
    process.exit(1);
  }

  const db = createAdminClient();
  const { data: stock } = await db
    .from("stocks")
    .select("id, name")
    .eq("symbol", symbol.toUpperCase())
    .maybeSingle();
  if (!stock) {
    console.log(`Unknown symbol: ${symbol}`);
    process.exit(1);
  }

  console.log(`\nQuestion: ${question}`);
  console.log(`Company:  ${stock.name}\n`);

  const chunks = await retrieveChunks(stock.id, question);
  if (chunks.length === 0) {
    console.log("No relevant chunks found (or no filings ingested yet).");
    return;
  }

  chunks.forEach((c, i) => {
    console.log(
      `[${i + 1}] sim=${c.similarity.toFixed(3)}  ${c.filingTitle ?? "?"}  §${c.section ?? "General"}  p.${c.page ?? "?"}`,
    );
    console.log(`    ${c.content.slice(0, 200).replace(/\s+/g, " ")}…\n`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
