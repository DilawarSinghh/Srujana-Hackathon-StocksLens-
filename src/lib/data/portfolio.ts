import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { HoldingWithData } from "@/lib/portfolio/types";

export interface PortfolioData {
  portfolioId: string;
  holdings: HoldingWithData[];
  lastUpdated: string | null;
}

/** Get (or create) the signed-in user's default portfolio id. */
export async function ensureDefaultPortfolio(
  userId: string,
): Promise<string | null> {
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("portfolios")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("portfolios")
    .insert({ user_id: userId, name: "My Portfolio" })
    .select("id")
    .single();
  if (error) {
    console.error("ensureDefaultPortfolio:", error.message);
    return null;
  }
  return created.id;
}

/** Load the user's portfolio holdings enriched with price + beta. */
export async function getPortfolio(userId: string): Promise<PortfolioData | null> {
  const supabase = await createClient();
  const portfolioId = await ensureDefaultPortfolio(userId);
  if (!portfolioId) return null;

  const { data: holdings } = await supabase
    .from("holdings")
    .select("id, stock_id, quantity, avg_buy_price")
    .eq("portfolio_id", portfolioId);

  if (!holdings || holdings.length === 0) {
    return { portfolioId, holdings: [], lastUpdated: null };
  }

  const stockIds = holdings.map((h) => h.stock_id);
  const [stocksRes, metricsRes] = await Promise.all([
    supabase.from("stocks").select("id, symbol, name, sector, cap_category").in("id", stockIds),
    supabase
      .from("stock_metrics")
      .select("stock_id, price, beta, as_of, piotroski_score, altman_zone")
      .in("stock_id", stockIds),
  ]);

  const stockById = new Map((stocksRes.data ?? []).map((s) => [s.id, s]));
  const metricsById = new Map((metricsRes.data ?? []).map((m) => [m.stock_id, m]));

  let lastUpdated: string | null = null;
  const enriched: HoldingWithData[] = holdings.map((h) => {
    const s = stockById.get(h.stock_id);
    const m = metricsById.get(h.stock_id);
    if (m?.as_of && (!lastUpdated || m.as_of > lastUpdated)) lastUpdated = m.as_of;
    return {
      symbol: s?.symbol ?? "?",
      name: s?.name ?? "Unknown",
      sector: s?.sector ?? null,
      quantity: Number(h.quantity),
      avgBuyPrice: Number(h.avg_buy_price),
      currentPrice: m?.price ?? null,
      beta: m?.beta ?? null,
      piotroskiScore: m?.piotroski_score ?? null,
      altmanZone: m?.altman_zone ?? null,
      capCategory: s?.cap_category ?? null,
    };
  });

  return { portfolioId, holdings: enriched, lastUpdated };
}

/** Load the investor profile for a portfolio, or null if none is set. */
export async function getPortfolioProfile(
  portfolioId: string,
): Promise<{
  riskTolerance: "conservative" | "moderate" | "aggressive";
  horizonYears: number;
  liquidityNeedPct: number;
} | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("portfolio_profiles")
    .select("risk_tolerance, horizon_years, liquidity_need_pct")
    .eq("portfolio_id", portfolioId)
    .maybeSingle();
  // A missing table (migration 0009 not applied) must not crash the page.
  if (error || !data) return null;
  return {
    riskTolerance: data.risk_tolerance,
    horizonYears: data.horizon_years,
    liquidityNeedPct: Number(data.liquidity_need_pct),
  };
}

/** 1y daily returns per symbol for the covariance-based volatility. */
export async function getReturnsForSymbols(
  symbols: string[],
): Promise<Map<string, Map<string, number>>> {
  const supabase = await createClient();
  const out = new Map<string, Map<string, number>>();
  if (symbols.length === 0) return out;

  const { data: stocks } = await supabase
    .from("stocks")
    .select("id, symbol")
    .in("symbol", symbols.map((s) => s.toUpperCase()));
  if (!stocks) return out;

  const since = new Date();
  since.setFullYear(since.getFullYear() - 1);
  const sinceStr = since.toISOString().slice(0, 10);

  for (const s of stocks) {
    const { data: bars } = await supabase
      .from("price_history")
      .select("date, close")
      .eq("stock_id", s.id)
      .gte("date", sinceStr)
      .order("date", { ascending: true });

    const map = new Map<string, number>();
    const rows = (bars ?? []).filter((b) => b.close != null);
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1].close as number;
      const cur = rows[i].close as number;
      if (prev > 0 && cur > 0) map.set(rows[i].date, Math.log(cur / prev));
    }
    out.set(s.symbol, map);
  }
  return out;
}
