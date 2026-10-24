/**
 * Compute the Fundamental Score for every stock and insert into `scores`.
 *
 *   pnpm score
 *
 * The LLM is NOT involved — all math is in src/lib/scoring (pure functions).
 */
import { db } from "./lib/db";
import { isBankSector } from "@/lib/scoring/constants";
import {
  scoreGroup,
  cappedOcfRatio,
  type StockForScoring,
  type ScoringMetrics,
} from "@/lib/scoring/score";
import type { TablesInsert } from "@/types/database";

interface StockRow {
  id: string;
  symbol: string;
  sector: string | null;
}

/** Median of a numeric array (nulls already removed). */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

async function main() {
  console.log("Computing scores…\n");

  const { data: stocks, error } = await db
    .from("stocks")
    .select("id, symbol, sector")
    .eq("is_active", true);
  if (error) throw new Error(`read stocks: ${error.message}`);
  if (!stocks || stocks.length === 0) {
    console.log("No active stocks. Run `pnpm seed` and `pnpm fetch` first.");
    return;
  }

  // Metrics, latest fundamentals (for OCF ratio + red flag), latest governance.
  const { data: metricsRows } = await db.from("stock_metrics").select("*");
  const metricsById = new Map(
    (metricsRows ?? []).map((m) => [m.stock_id, m]),
  );

  const { data: fundamentals } = await db
    .from("fundamentals_annual")
    .select("stock_id, fiscal_year, operating_cash_flow, net_profit")
    .order("fiscal_year", { ascending: true });

  const fundByStock = new Map<
    string,
    { fiscal_year: number; operating_cash_flow: number | null; net_profit: number | null }[]
  >();
  for (const f of fundamentals ?? []) {
    const arr = fundByStock.get(f.stock_id) ?? [];
    arr.push(f);
    fundByStock.set(f.stock_id, arr);
  }

  // Latest governance per stock.
  const { data: govRows } = await db
    .from("governance_inputs")
    .select("*")
    .order("as_of", { ascending: false });
  type GovRow = NonNullable<typeof govRows>[number];
  const govByStock = new Map<string, GovRow>();
  for (const g of govRows ?? []) {
    if (!govByStock.has(g.stock_id)) govByStock.set(g.stock_id, g);
  }

  // Sector P/E medians for valuation's pe_rel_sector.
  const sectorPes = new Map<string, number[]>();
  for (const s of stocks as StockRow[]) {
    const m = metricsById.get(s.id);
    const sector = s.sector ?? "Unknown";
    if (m?.pe != null && Number.isFinite(m.pe) && m.pe > 0) {
      const arr = sectorPes.get(sector) ?? [];
      arr.push(m.pe);
      sectorPes.set(sector, arr);
    }
  }
  const sectorMedianPe = new Map<string, number | null>();
  for (const [sector, pes] of sectorPes) {
    sectorMedianPe.set(sector, median(pes));
  }

  // Build scoring inputs.
  const scoringInputs: StockForScoring[] = (stocks as StockRow[]).map((s) => {
    const m = metricsById.get(s.id);
    const funds = fundByStock.get(s.id) ?? [];
    const latestFund = funds.at(-1);
    const recentOcf = funds.slice(-3).map((f) => f.operating_cash_flow);

    const sector = s.sector ?? "Unknown";
    const medPe = sectorMedianPe.get(sector) ?? null;
    const peRel =
      m?.pe != null && medPe != null && medPe > 0 ? m.pe / medPe : null;

    const ocfRatio = isBankSector(sector)
      ? null
      : cappedOcfRatio(
          latestFund?.operating_cash_flow ?? null,
          latestFund?.net_profit ?? null,
        );

    const metrics: ScoringMetrics = {
      roe: m?.roe ?? null,
      roce: m?.roce ?? null,
      operating_margin: m?.operating_margin ?? null,
      revenue_cagr_3y: m?.revenue_cagr_3y ?? null,
      revenue_cagr_5y: m?.revenue_cagr_5y ?? null,
      profit_cagr_3y: m?.profit_cagr_3y ?? null,
      profit_cagr_5y: m?.profit_cagr_5y ?? null,
      debt_to_equity: m?.debt_to_equity ?? null,
      interest_coverage: m?.interest_coverage ?? null,
      ocf_to_net_profit: ocfRatio,
      pe_rel_sector: peRel,
      peg: m?.peg ?? null,
      volatility_1y: m?.volatility_1y ?? null,
      max_drawdown_3y: m?.max_drawdown_3y ?? null,
    };

    const g = govByStock.get(s.id);

    return {
      stock_id: s.id,
      symbol: s.symbol,
      sector,
      metrics,
      growthPillarPositive: (m?.profit_cagr_3y ?? 0) > 0,
      governance: g
        ? {
            promoter_pledge_pct: g.promoter_pledge_pct,
            promoter_holding_change_1y: g.promoter_holding_change_1y,
            auditor_opinion: g.auditor_opinion,
            related_party_trend: g.related_party_trend,
          }
        : null,
      recentOcf,
    };
  });

  // Group by sector and score each group (universe used for small-peer fallback).
  const bySector = new Map<string, StockForScoring[]>();
  for (const s of scoringInputs) {
    const key = s.sector ?? "Unknown";
    const arr = bySector.get(key) ?? [];
    arr.push(s);
    bySector.set(key, arr);
  }

  const inserts: TablesInsert<"scores">[] = [];
  const ranked: { symbol: string; total: number; label: string; capped: boolean; conf: number }[] = [];
  const symbolById = new Map(scoringInputs.map((s) => [s.stock_id, s.symbol]));

  for (const [, group] of bySector) {
    const results = scoreGroup(group, scoringInputs);
    for (const r of results) {
      inserts.push({
        stock_id: r.stock_id,
        total_score: r.total_score,
        label: r.label,
        profitability: r.profitability,
        growth: r.growth,
        financial_health: r.financial_health,
        valuation: r.valuation,
        governance: r.governance,
        stability: r.stability,
        red_flags: r.red_flags,
        capped: r.capped,
        data_confidence: r.data_confidence,
        sector_peer_count: r.sector_peer_count,
        explanations: r.explanations,
        formula_version: r.formula_version,
      });
      ranked.push({
        symbol: symbolById.get(r.stock_id) ?? r.stock_id,
        total: r.total_score,
        label: r.label,
        capped: r.capped,
        conf: r.data_confidence,
      });
    }
  }

  const { error: insErr } = await db.from("scores").insert(inserts);
  if (insErr) throw new Error(`insert scores: ${insErr.message}`);

  // Ranked table.
  ranked.sort((a, b) => b.total - a.total);
  console.log("─────────────── Ranked by Fundamental Score ───────────────");
  console.log(
    "RANK".padEnd(6) +
      "SYMBOL".padEnd(14) +
      "SCORE".padEnd(8) +
      "LABEL".padEnd(24) +
      "FLAGS".padEnd(7) +
      "CONF",
  );
  ranked.forEach((r, i) => {
    console.log(
      String(i + 1).padEnd(6) +
        r.symbol.padEnd(14) +
        String(r.total).padEnd(8) +
        r.label.padEnd(24) +
        (r.capped ? "capped" : "-").padEnd(7) +
        r.conf.toFixed(2),
    );
  });
  console.log(`\nScored ${inserts.length} stocks.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
