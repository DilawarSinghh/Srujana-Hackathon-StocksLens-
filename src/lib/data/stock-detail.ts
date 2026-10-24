import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  Tables,
  RedFlag,
  ScoreExplanations,
} from "@/types/database";

export interface PricePoint {
  date: string;
  close: number;
}

export interface PeerRow {
  symbol: string;
  name: string;
  total_score: number | null;
  label: string | null;
  pe: number | null;
  roe: number | null;
  debt_to_equity: number | null;
}

export interface StockDetail {
  stock: Tables<"stocks">;
  metrics: Tables<"stock_metrics"> | null;
  score: Tables<"scores"> | null;
  fundamentals: Tables<"fundamentals_annual">[]; // oldest -> newest, up to 5
  governance: Tables<"governance_inputs"> | null;
  prices: PricePoint[]; // chronological
  peers: PeerRow[];
  redFlags: RedFlag[];
  explanations: ScoreExplanations | null;
  lastUpdated: string | null;
}

/** Fetch everything needed for the detail page. Returns null if not found. */
export async function getStockDetail(
  symbol: string,
): Promise<StockDetail | null> {
  const supabase = await createClient();
  const upper = symbol.toUpperCase();

  const { data: stock, error } = await supabase
    .from("stocks")
    .select("*")
    .eq("symbol", upper)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !stock) return null;

  const [metricsRes, scoreRes, fundRes, govRes, priceRes] = await Promise.all([
    supabase.from("stock_metrics").select("*").eq("stock_id", stock.id).maybeSingle(),
    supabase
      .from("latest_scores")
      .select("*")
      .eq("stock_id", stock.id)
      .maybeSingle(),
    supabase
      .from("fundamentals_annual")
      .select("*")
      .eq("stock_id", stock.id)
      .order("fiscal_year", { ascending: true }),
    supabase
      .from("governance_inputs")
      .select("*")
      .eq("stock_id", stock.id)
      .order("as_of", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("price_history")
      .select("date, close")
      .eq("stock_id", stock.id)
      .order("date", { ascending: true }),
  ]);

  const metrics = metricsRes.data ?? null;
  const score = scoreRes.data ?? null;
  const fundamentals = (fundRes.data ?? []).slice(-5);
  const governance = govRes.data ?? null;

  const prices: PricePoint[] = (priceRes.data ?? [])
    .filter((p): p is { date: string; close: number } => p.close != null)
    .map((p) => ({ date: p.date, close: p.close }));

  // Peers: up to 4 same-sector stocks (excluding this one).
  const peers = await fetchPeers(supabase, stock.id, stock.sector);

  return {
    stock,
    metrics,
    score,
    fundamentals,
    governance,
    prices,
    peers,
    redFlags: (score?.red_flags as RedFlag[] | undefined) ?? [],
    explanations: (score?.explanations as ScoreExplanations | null) ?? null,
    lastUpdated: metrics?.as_of ?? null,
  };
}

async function fetchPeers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  stockId: string,
  sector: string | null,
): Promise<PeerRow[]> {
  if (!sector) return [];

  const { data: sameSector } = await supabase
    .from("stocks")
    .select("id, symbol, name")
    .eq("sector", sector)
    .eq("is_active", true)
    .neq("id", stockId)
    .limit(6);

  if (!sameSector || sameSector.length === 0) return [];

  const ids = sameSector.map((s) => s.id);
  const [metricsRes, scoresRes] = await Promise.all([
    supabase.from("stock_metrics").select("stock_id, pe, roe, debt_to_equity").in("stock_id", ids),
    supabase.from("latest_scores").select("stock_id, total_score, label").in("stock_id", ids),
  ]);

  const mById = new Map((metricsRes.data ?? []).map((m) => [m.stock_id, m]));
  const sById = new Map((scoresRes.data ?? []).map((s) => [s.stock_id, s]));

  return sameSector
    .map((s) => {
      const m = mById.get(s.id);
      const sc = sById.get(s.id);
      return {
        symbol: s.symbol,
        name: s.name,
        total_score: sc?.total_score ?? null,
        label: sc?.label ?? null,
        pe: m?.pe ?? null,
        roe: m?.roe ?? null,
        debt_to_equity: m?.debt_to_equity ?? null,
      };
    })
    .sort((a, b) => (b.total_score ?? -Infinity) - (a.total_score ?? -Infinity))
    .slice(0, 4);
}

/** All active symbols (for generateStaticParams / sitemaps). */
export async function getAllSymbols(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("stocks")
    .select("symbol")
    .eq("is_active", true);
  return (data ?? []).map((s) => s.symbol);
}
