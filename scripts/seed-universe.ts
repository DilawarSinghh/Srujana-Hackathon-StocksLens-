/**
 * Seed the stock universe and optional governance inputs into Supabase.
 *
 *   pnpm seed
 *
 * Idempotent: upserts stocks by symbol; governance rows by (stock_id, as_of).
 */
import { readFileSync, existsSync } from "node:fs";
import { db } from "./lib/db";
import {
  UNIVERSE,
  toYahooSymbol,
  type UniverseEntry,
} from "@/config/universe";
import type {
  AuditorOpinion,
  RelatedPartyTrend,
  TablesInsert,
} from "@/types/database";

const GOVERNANCE_CSV = "data/governance_seed.csv";

async function seedStocks(): Promise<Map<string, string>> {
  const rows: TablesInsert<"stocks">[] = UNIVERSE.map((u: UniverseEntry) => ({
    symbol: u.symbol,
    yahoo_symbol: toYahooSymbol(u.symbol),
    exchange: "NSE",
    name: u.name,
    sector: u.sector,
    cap_category: u.cap_category,
    currency: "INR",
    country: "IN",
    is_active: true,
  }));

  const { error } = await db
    .from("stocks")
    .upsert(rows, { onConflict: "symbol" });

  if (error) throw new Error(`Failed to upsert stocks: ${error.message}`);
  console.log(`✓ Upserted ${rows.length} stocks.`);

  // Return symbol -> id map for governance loading.
  const { data, error: selErr } = await db
    .from("stocks")
    .select("id, symbol");
  if (selErr) throw new Error(`Failed to read stocks: ${selErr.message}`);

  const map = new Map<string, string>();
  for (const s of data ?? []) map.set(s.symbol, s.id);
  return map;
}

const AUDITOR_VALUES: AuditorOpinion[] = [
  "unqualified",
  "qualified",
  "adverse",
  "disclaimer",
  "unknown",
];
const RPT_VALUES: RelatedPartyTrend[] = [
  "stable",
  "rising",
  "sharply_rising",
  "unknown",
];

/** Minimal CSV parser (no quoted-field support — our seed data is simple). */
function parseCsv(text: string): Record<string, string>[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return []; // header only or empty

  const header = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row: Record<string, string> = {};
    header.forEach((h, i) => {
      row[h] = (cells[i] ?? "").trim();
    });
    return row;
  });
}

function numOrNull(v: string): number | null {
  if (v === "" || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function seedGovernance(symbolToId: Map<string, string>) {
  if (!existsSync(GOVERNANCE_CSV)) {
    console.log(`• ${GOVERNANCE_CSV} not found — skipping governance seed.`);
    return;
  }

  const rows = parseCsv(readFileSync(GOVERNANCE_CSV, "utf8"));
  if (rows.length === 0) {
    console.log(
      `• ${GOVERNANCE_CSV} has no data rows — skipping governance seed.`,
    );
    return;
  }

  const inserts: TablesInsert<"governance_inputs">[] = [];
  for (const r of rows) {
    const stockId = symbolToId.get(r.symbol);
    if (!stockId) {
      console.warn(`  ! Unknown symbol "${r.symbol}" in CSV — skipped.`);
      continue;
    }

    const auditor = AUDITOR_VALUES.includes(r.auditor_opinion as AuditorOpinion)
      ? (r.auditor_opinion as AuditorOpinion)
      : "unknown";
    const rpt = RPT_VALUES.includes(r.related_party_trend as RelatedPartyTrend)
      ? (r.related_party_trend as RelatedPartyTrend)
      : "unknown";

    inserts.push({
      stock_id: stockId,
      as_of: r.as_of || new Date().toISOString().slice(0, 10),
      promoter_holding_pct: numOrNull(r.promoter_holding_pct),
      promoter_pledge_pct: numOrNull(r.promoter_pledge_pct),
      promoter_holding_change_1y: numOrNull(r.promoter_holding_change_1y),
      fii_pct: numOrNull(r.fii_pct),
      dii_pct: numOrNull(r.dii_pct),
      public_pct: numOrNull(r.public_pct),
      auditor_opinion: auditor,
      related_party_trend: rpt,
      source_note: r.source_note || null,
    });
  }

  if (inserts.length === 0) {
    console.log("• No valid governance rows to insert.");
    return;
  }

  const { error } = await db
    .from("governance_inputs")
    .upsert(inserts, { onConflict: "stock_id,as_of" });
  if (error) throw new Error(`Failed to upsert governance: ${error.message}`);
  console.log(`✓ Upserted ${inserts.length} governance rows.`);
}

async function main() {
  console.log("Seeding universe…");
  const symbolToId = await seedStocks();
  await seedGovernance(symbolToId);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
