import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { PILLAR_LABELS, PILLAR_WEIGHTS, type PillarKey } from "@/lib/scoring/constants";
import type { RedFlag, ScoreExplanations } from "@/types/database";

/** Human labels for the metrics surfaced in the DATA block. */
const METRIC_LABELS: Record<string, string> = {
  price: "Price",
  market_cap: "Market cap",
  pe: "P/E",
  pb: "P/B",
  roe: "ROE",
  roce: "ROCE",
  operating_margin: "Operating margin",
  debt_to_equity: "Debt-to-equity",
  interest_coverage: "Interest coverage",
  dividend_yield: "Dividend yield",
  revenue_cagr_3y: "Revenue CAGR (3y)",
  profit_cagr_3y: "Profit CAGR (3y)",
  beta: "Beta",
};

export interface PriceSummary {
  as_of: string | null;
  latest_close: number | null;
  /** The earliest date in the available history window. */
  first_date: string | null;
  first_close: number | null;
  /** Percent change over the full available window (not a prediction). */
  change_pct: number | null;
  /** Number of daily bars available. */
  points: number;
  week52_high: number | null;
  week52_low: number | null;
}

export interface ScoreComponents {
  total_score: number | null;
  label: string | null;
  data_confidence: number | null;
  capped: boolean | null;
  formula_version: string | null;
  /** Per-pillar sub-scores (0-100) with weight and label. Null = not scored. */
  pillars: {
    key: PillarKey;
    label: string;
    weight: number;
    score: number | null;
  }[];
}

export interface ChatDataBlock {
  symbol: string;
  name: string;
  exchange: string | null;
  sector: string | null;
  industry: string | null;
  /** Freshest market-data timestamp; prices are end-of-day, not real-time. */
  as_of: string | null;
  metrics: Record<string, number | null> | null;
  price_summary: PriceSummary | null;
  fundamentals_annual: Record<string, number | null>[];
  score: ScoreComponents | null;
  red_flags: { code: string; title: string }[];
  governance: Record<string, unknown> | null;
  /** Labels of metrics/sources that are NOT available (null, not zero). */
  missing: string[];
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
 *
 * The DATA block is the backbone of "Stock Analysis" mode: it is useful on its
 * own (no filings required) and explicitly lists which metrics are unavailable
 * so the model never silently treats a missing value as zero.
 */
export async function loadStockContext(
  stockId: string,
): Promise<StockContext | null> {
  const db = createAdminClient();

  const { data: stock } = await db
    .from("stocks")
    .select("id, symbol, name, sector, exchange, industry")
    .eq("id", stockId)
    .maybeSingle();
  if (!stock) return null;

  const [metricsRes, fundRes, scoreRes, govRes, priceRes] = await Promise.all([
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
    // Only the two ends of the window are needed for the performance summary;
    // we read date+close ascending and derive first/last without loading every
    // bar into the prompt.
    db
      .from("price_history")
      .select("date, close")
      .eq("stock_id", stockId)
      .order("date", { ascending: true }),
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

  // Price performance over the available window (end-of-day, historical).
  const price_summary = buildPriceSummary(priceRes.data ?? [], m?.as_of ?? null, {
    week52High: m?.week52_high ?? null,
    week52Low: m?.week52_low ?? null,
  });

  // Score component breakdown (deterministic engine output; never recomputed
  // by the model).
  const score: ScoreComponents | null = sc
    ? {
        total_score: sc.total_score,
        label: sc.label,
        data_confidence: sc.data_confidence,
        capped: sc.capped,
        formula_version: sc.formula_version,
        pillars: (Object.keys(PILLAR_WEIGHTS) as PillarKey[]).map((key) => ({
          key,
          label: PILLAR_LABELS[key],
          weight: PILLAR_WEIGHTS[key],
          score: (sc[key] as number | null) ?? null,
        })),
      }
    : null;

  const data: ChatDataBlock = {
    symbol: stock.symbol,
    name: stock.name,
    exchange: stock.exchange,
    sector: stock.sector,
    industry: stock.industry,
    as_of: m?.as_of ?? null,
    metrics,
    price_summary,
    fundamentals_annual,
    score,
    red_flags: redFlags,
    governance,
    missing: collectMissing({
      metrics,
      hasFundamentals: fundamentals_annual.length > 0,
      hasScore: Boolean(sc),
      hasGovernance: Boolean(g),
      hasPrices: price_summary != null && price_summary.points > 0,
    }),
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

/** Build a compact price-performance summary from the available daily bars. */
function buildPriceSummary(
  rows: { date: string; close: number | null }[],
  asOf: string | null,
  wk: { week52High: number | null; week52Low: number | null },
): PriceSummary | null {
  const valid = rows.filter(
    (r): r is { date: string; close: number } => r.close != null,
  );
  if (valid.length === 0) {
    return {
      as_of: asOf,
      latest_close: null,
      first_date: null,
      first_close: null,
      change_pct: null,
      points: 0,
      week52_high: wk.week52High,
      week52_low: wk.week52Low,
    };
  }
  const first = valid[0];
  const last = valid[valid.length - 1];
  const change_pct =
    first.close !== 0
      ? Math.round(((last.close - first.close) / first.close) * 1000) / 10
      : null;
  return {
    as_of: asOf,
    latest_close: last.close,
    first_date: first.date,
    first_close: first.close,
    change_pct,
    points: valid.length,
    week52_high: wk.week52High,
    week52_low: wk.week52Low,
  };
}

/** List labels of data that is unavailable (null), so the model can disclose it. */
function collectMissing(params: {
  metrics: Record<string, number | null> | null;
  hasFundamentals: boolean;
  hasScore: boolean;
  hasGovernance: boolean;
  hasPrices: boolean;
}): string[] {
  const missing: string[] = [];
  if (!params.metrics) {
    missing.push("All market/fundamental metrics");
  } else {
    for (const [key, label] of Object.entries(METRIC_LABELS)) {
      const v = params.metrics[key];
      if (v == null) missing.push(label);
    }
  }
  if (!params.hasPrices) missing.push("Price history");
  if (!params.hasFundamentals) missing.push("Annual fundamentals");
  if (!params.hasScore) missing.push("Fundamental score");
  if (!params.hasGovernance) missing.push("Shareholding / governance data");
  return missing;
}
