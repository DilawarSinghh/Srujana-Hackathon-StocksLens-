import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RedFlag, ScoreExplanations } from "@/types/database";

export interface ChatDataBlock {
  symbol: string;
  name: string;
  sector: string | null;
  metrics: Record<string, number | null> | null;
  fundamentals_annual: Record<string, number | null>[];
  score: {
    total_score: number | null;
    label: string | null;
    data_confidence: number | null;
    capped: boolean | null;
  } | null;
  red_flags: { code: string; title: string }[];
  governance: Record<string, unknown> | null;
}

export interface StockContext {
  stockId: string;
  name: string;
  data: ChatDataBlock;
  /** Neutral bullets for the advice refusal (from explanations + red flags). */
  neutralBullets: string[];
}

/**
 * Load the compact DATA block + neutral refusal bullets for a stock.
 * Uses the admin client (server-only) to read public data efficiently.
 */
export async function loadStockContext(
  stockId: string,
): Promise<StockContext | null> {
  const db = createAdminClient();

  const { data: stock } = await db
    .from("stocks")
    .select("id, symbol, name, sector")
    .eq("id", stockId)
    .maybeSingle();
  if (!stock) return null;

  const [metricsRes, fundRes, scoreRes, govRes] = await Promise.all([
    db.from("stock_metrics").select("*").eq("stock_id", stockId).maybeSingle(),
    db
      .from("fundamentals_annual")
      .select("*")
      .eq("stock_id", stockId)
      .order("fiscal_year", { ascending: false })
      .limit(5),
    db.from("latest_scores").select("*").eq("stock_id", stockId).maybeSingle(),
    db
      .from("governance_inputs")
      .select("*")
      .eq("stock_id", stockId)
      .order("as_of", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const m = metricsRes.data;
  const metrics = m
    ? {
        price: m.price,
        market_cap: m.market_cap,
        pe: m.pe,
        pb: m.pb,
        roe: m.roe,
        roce: m.roce,
        operating_margin: m.operating_margin,
        debt_to_equity: m.debt_to_equity,
        interest_coverage: m.interest_coverage,
        dividend_yield: m.dividend_yield,
        revenue_cagr_3y: m.revenue_cagr_3y,
        profit_cagr_3y: m.profit_cagr_3y,
        beta: m.beta,
      }
    : null;

  const fundamentals_annual = (fundRes.data ?? []).map((f) => ({
    fiscal_year: f.fiscal_year,
    revenue: f.revenue,
    operating_profit: f.operating_profit,
    net_profit: f.net_profit,
    total_debt: f.total_debt,
    total_equity: f.total_equity,
    operating_cash_flow: f.operating_cash_flow,
  }));

  const sc = scoreRes.data;
  const redFlags = ((sc?.red_flags as RedFlag[] | undefined) ?? []).map((r) => ({
    code: r.code,
    title: r.title,
  }));
  const explanations = (sc?.explanations as ScoreExplanations | null) ?? null;

  const g = govRes.data;
  const governance = g
    ? {
        promoter_holding_pct: g.promoter_holding_pct,
        promoter_pledge_pct: g.promoter_pledge_pct,
        fii_pct: g.fii_pct,
        dii_pct: g.dii_pct,
        public_pct: g.public_pct,
        auditor_opinion: g.auditor_opinion,
        related_party_trend: g.related_party_trend,
      }
    : null;

  const data: ChatDataBlock = {
    symbol: stock.symbol,
    name: stock.name,
    sector: stock.sector,
    metrics,
    fundamentals_annual,
    score: sc
      ? {
          total_score: sc.total_score,
          label: sc.label,
          data_confidence: sc.data_confidence,
          capped: sc.capped,
        }
      : null,
    red_flags: redFlags,
    governance,
  };

  // Neutral bullets for the refusal: a couple from explanations, then flags.
  const neutralBullets: string[] = [];
  if (explanations) {
    for (const pillar of ["profitability", "growth", "financial_health"] as const) {
      const first = explanations[pillar]?.[0];
      if (first) neutralBullets.push(first);
      if (neutralBullets.length >= 2) break;
    }
  }
  for (const rf of redFlags) {
    neutralBullets.push(`Red flag: ${rf.title}.`);
    if (neutralBullets.length >= 3) break;
  }
  if (sc?.label) {
    neutralBullets.push(`Overall: ${sc.label} (score ${Math.round(sc.total_score ?? 0)}/100).`);
  }

  return { stockId, name: stock.name, data, neutralBullets };
}
