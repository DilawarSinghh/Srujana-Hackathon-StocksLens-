import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Tables, RedFlag, ScoreExplanations } from "@/types/database";

/** A stock joined with its latest metrics and score for listing/detail. */
export interface StockListItem {
  id: string;
  symbol: string;
  name: string;
  sector: string | null;
  exchange: string | null;
  cap_category: "large" | "mid" | "small" | null;
  // metrics
  price: number | null;
  prev_close: number | null;
  debt_to_equity: number | null;
  dividend_yield: number | null;
  pe: number | null;
  roe: number | null;
  // score
  total_score: number | null;
  label: string | null;
  growth: number | null;
  capped: boolean | null;
  data_confidence: number | null;
  red_flags: RedFlag[];
  as_of: string | null;
}

type MetricsRow = Tables<"stock_metrics">;
type ScoreRow = Tables<"scores">;

/**
 * Fetch all active stocks joined with latest metrics + latest score.
 * Read-only (public data). Returns [] on error (logged) so pages can show an
 * empty state rather than crash.
 */
export async function getStockListing(): Promise<{
  items: StockListItem[];
  lastUpdated: string | null;
  error: boolean;
}> {
  const supabase = await createClient();

  const [stocksRes, metricsRes, scoresRes] = await Promise.all([
    supabase
      .from("stocks")
      .select("id, symbol, name, sector, exchange, cap_category")
      .eq("is_active", true),
    supabase.from("stock_metrics").select("*"),
    supabase.from("latest_scores").select("*"),
  ]);

  if (stocksRes.error) {
    console.error("getStockListing stocks:", stocksRes.error.message);
    return { items: [], lastUpdated: null, error: true };
  }

  const metricsById = new Map<string, MetricsRow>(
    (metricsRes.data ?? []).map((m) => [m.stock_id, m]),
  );
  const scoreById = new Map<string, ScoreRow>(
    (scoresRes.data ?? []).map((s) => [s.stock_id, s]),
  );

  let lastUpdated: string | null = null;

  const items: StockListItem[] = (stocksRes.data ?? []).map((s) => {
    const m = metricsById.get(s.id);
    const sc = scoreById.get(s.id);
    if (m?.as_of && (!lastUpdated || m.as_of > lastUpdated)) {
      lastUpdated = m.as_of;
    }
    return {
      id: s.id,
      symbol: s.symbol,
      name: s.name,
      sector: s.sector,
      exchange: s.exchange,
      cap_category: s.cap_category,
      price: m?.price ?? null,
      prev_close: m?.prev_close ?? null,
      debt_to_equity: m?.debt_to_equity ?? null,
      dividend_yield: m?.dividend_yield ?? null,
      pe: m?.pe ?? null,
      roe: m?.roe ?? null,
      total_score: sc?.total_score ?? null,
      label: sc?.label ?? null,
      growth: sc?.growth ?? null,
      capped: sc?.capped ?? null,
      data_confidence: sc?.data_confidence ?? null,
      red_flags: (sc?.red_flags as RedFlag[] | undefined) ?? [],
      as_of: m?.as_of ?? null,
    };
  });

  return { items, lastUpdated, error: false };
}

/** Distinct sectors present in the active universe, sorted. */
export function sectorsOf(items: StockListItem[]): string[] {
  const set = new Set<string>();
  for (const i of items) if (i.sector) set.add(i.sector);
  return [...set].sort();
}

export type { RedFlag, ScoreExplanations };
