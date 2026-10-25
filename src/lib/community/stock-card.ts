import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { StockCardSnapshot } from "@/types/database";

/**
 * Build point-in-time stock-card snapshots for a set of symbols, reading ONLY
 * existing stored data (stocks + stock_metrics + latest_scores). Nulls are
 * preserved — never coerced to 0. The scoring engine is the source of truth;
 * we copy `total_score`/`label`, we do not recompute anything here.
 *
 * Returns a map keyed by validated UPPERCASE symbol. Symbols not in the
 * universe are omitted (caller treats that as "invalid ticker").
 */
export async function buildStockSnapshots(
  symbols: string[],
): Promise<Map<string, { stockId: string; snapshot: StockCardSnapshot }>> {
  const out = new Map<string, { stockId: string; snapshot: StockCardSnapshot }>();
  const wanted = [...new Set(symbols.map((s) => s.toUpperCase()))];
  if (wanted.length === 0) return out;

  const supabase = await createClient();
  const { data: stocks } = await supabase
    .from("stocks")
    .select("id, symbol, name, exchange, sector")
    .in("symbol", wanted)
    .eq("is_active", true);
  if (!stocks || stocks.length === 0) return out;

  const ids = stocks.map((s) => s.id);
  const [metricsRes, scoresRes] = await Promise.all([
    supabase
      .from("stock_metrics")
      .select(
        "stock_id, price, as_of, pe, pb, roe, operating_margin, revenue_cagr_3y",
      )
      .in("stock_id", ids),
    supabase
      .from("latest_scores")
      .select("stock_id, total_score, label")
      .in("stock_id", ids),
  ]);
  const metricsById = new Map((metricsRes.data ?? []).map((m) => [m.stock_id, m]));
  const scoreById = new Map((scoresRes.data ?? []).map((s) => [s.stock_id, s]));

  for (const s of stocks) {
    const m = metricsById.get(s.id);
    const sc = scoreById.get(s.id);
    out.set(s.symbol, {
      stockId: s.id,
      snapshot: {
        symbol: s.symbol,
        name: s.name ?? null,
        exchange: s.exchange ?? null,
        sector: s.sector ?? null,
        price: m?.price ?? null,
        as_of: m?.as_of ?? null,
        pe: m?.pe ?? null,
        pb: m?.pb ?? null,
        roe: m?.roe ?? null,
        operating_margin: m?.operating_margin ?? null,
        revenue_cagr_3y: m?.revenue_cagr_3y ?? null,
        total_score: sc?.total_score ?? null,
        label: sc?.label ?? null,
      },
    });
  }
  return out;
}

/** Validate candidate symbols against the universe. Returns the valid subset
 *  (uppercase) and their stock ids. */
export async function resolveSymbols(
  symbols: string[],
): Promise<{ valid: string[]; idBySymbol: Map<string, string> }> {
  const snaps = await buildStockSnapshots(symbols);
  const idBySymbol = new Map<string, string>();
  for (const [sym, v] of snaps) idBySymbol.set(sym, v.stockId);
  return { valid: [...idBySymbol.keys()], idBySymbol };
}
