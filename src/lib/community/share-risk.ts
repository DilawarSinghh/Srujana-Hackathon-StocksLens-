import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio, getReturnsForSymbols } from "@/lib/data/portfolio";
import { positionValues, computeConcentration } from "@/lib/portfolio/concentration";
import { computePortfolioBeta } from "@/lib/portfolio/beta";
import { computePortfolioVolatility } from "@/lib/portfolio/volatility";
import type { ShareRiskSnapshot } from "@/types/database";

export interface ShareHoldingSnapshot {
  symbol: string;
  name: string | null;
  sector: string | null;
  allocationPct: number | null;
  quantity: number | null;
  investedAmount: number | null;
}

/**
 * Build the holding + deterministic-risk snapshot for a portfolio share.
 *
 * - Real portfolio: reads the owner's holdings (server-side, owner-scoped) and
 *   reuses the existing deterministic engine (concentration, beta, volatility).
 *   Allocation %, quantity, and invested amount are all derived here; the
 *   caller decides which to actually disclose.
 * - Hypothetical: the user supplies symbols + allocation %. Risk is computed
 *   from allocation weights and stored metrics; quantity/amount stay null.
 *
 * The LLM is never involved — all risk numbers come from code.
 */
export async function buildShareRiskSnapshot(opts: {
  userId: string;
  sourcePortfolioId: string | null;
  manualHoldings: { symbol: string; allocationPct?: number }[] | null;
  isHypothetical: boolean;
}): Promise<{ holdings: ShareHoldingSnapshot[]; riskSnapshot: ShareRiskSnapshot }> {
  if (opts.isHypothetical && opts.manualHoldings && opts.manualHoldings.length > 0) {
    return buildHypothetical(opts.manualHoldings);
  }
  return buildFromPortfolio(opts.userId);
}

async function buildFromPortfolio(userId: string): Promise<{
  holdings: ShareHoldingSnapshot[];
  riskSnapshot: ShareRiskSnapshot;
}> {
  const portfolio = await getPortfolio(userId);
  const holdings = portfolio?.holdings ?? [];
  const { positions } = positionValues(holdings);
  const concentration = computeConcentration(positions);
  const beta = computePortfolioBeta(
    positions,
    new Map(holdings.map((h) => [h.symbol, h.beta])),
  );
  const returns = await getReturnsForSymbols(holdings.map((h) => h.symbol));
  const weightBySymbol = new Map(
    positions.filter((p) => p.weight != null).map((p) => [p.symbol, p.weight as number]),
  );
  const vol = computePortfolioVolatility(weightBySymbol, returns);

  const snapHoldings: ShareHoldingSnapshot[] = positions.map((p) => ({
    symbol: p.symbol,
    name: p.name,
    sector: p.sector,
    allocationPct: p.weight != null ? p.weight * 100 : null,
    quantity: p.quantity,
    investedAmount: p.quantity * p.avgBuyPrice,
  }));

  return {
    holdings: snapHoldings,
    riskSnapshot: {
      beta: beta.beta,
      betaCoveredWeight: beta.coveredWeight,
      volatility: vol.volatility,
      hhi: concentration.hhi,
      topSector: concentration.topSector?.sector ?? null,
      topSectorWeight: concentration.topSector?.weight ?? null,
      concentrationFlags: concentration.flags,
    },
  };
}

async function buildHypothetical(
  manual: { symbol: string; allocationPct?: number }[],
): Promise<{ holdings: ShareHoldingSnapshot[]; riskSnapshot: ShareRiskSnapshot }> {
  const supabase = await createClient();
  const symbols = [...new Set(manual.map((m) => m.symbol.toUpperCase()))];
  const { data: stocks } = await supabase
    .from("stocks")
    .select("id, symbol, name, sector")
    .in("symbol", symbols)
    .eq("is_active", true);
  const bySymbol = new Map((stocks ?? []).map((s) => [s.symbol, s]));

  // Keep only symbols that exist in the universe.
  const valid = manual.filter((m) => bySymbol.has(m.symbol.toUpperCase()));
  const rawTotal = valid.reduce((s, m) => s + (m.allocationPct ?? 0), 0);

  const snapHoldings: ShareHoldingSnapshot[] = valid.map((m) => {
    const s = bySymbol.get(m.symbol.toUpperCase());
    // Normalise allocation to sum to 100 when provided; else equal-weight.
    const alloc =
      rawTotal > 0
        ? ((m.allocationPct ?? 0) / rawTotal) * 100
        : 100 / valid.length;
    return {
      symbol: s!.symbol,
      name: s!.name,
      sector: s!.sector,
      allocationPct: alloc,
      quantity: null,
      investedAmount: null,
    };
  });

  // Risk from allocation weights + stored beta. Volatility needs returns.
  const ids = valid.map((m) => bySymbol.get(m.symbol.toUpperCase())!.id);
  const { data: metrics } = await supabase
    .from("stock_metrics")
    .select("stock_id, beta")
    .in("stock_id", ids);
  const betaByStockId = new Map((metrics ?? []).map((m) => [m.stock_id, m.beta]));

  const weightBySymbol = new Map(
    snapHoldings.map((h) => [h.symbol, (h.allocationPct ?? 0) / 100]),
  );
  const betaBySymbol = new Map(
    snapHoldings.map((h) => {
      const id = bySymbol.get(h.symbol)!.id;
      return [h.symbol, betaByStockId.get(id) ?? null];
    }),
  );

  // Reuse the pure beta math with synthetic positions (weight only).
  const positions = snapHoldings.map((h) => ({
    symbol: h.symbol,
    name: h.name ?? h.symbol,
    sector: h.sector,
    quantity: 0,
    avgBuyPrice: 0,
    currentPrice: 1,
    value: weightBySymbol.get(h.symbol) ?? 0,
    weight: weightBySymbol.get(h.symbol) ?? 0,
    pnl: null,
    pnlPct: null,
  }));
  const beta = computePortfolioBeta(positions, betaBySymbol);

  // Sector concentration from weights.
  const sectorMap = new Map<string, number>();
  for (const h of snapHoldings) {
    const sec = h.sector ?? "Unknown";
    sectorMap.set(sec, (sectorMap.get(sec) ?? 0) + (h.allocationPct ?? 0) / 100);
  }
  const sectors = [...sectorMap.entries()].sort((a, b) => b[1] - a[1]);
  const hhi = snapHoldings.reduce(
    (s, h) => s + Math.pow((h.allocationPct ?? 0) / 100, 2),
    0,
  );
  const topSector = sectors[0] ?? null;

  const returns = await getReturnsForSymbols(snapHoldings.map((h) => h.symbol));
  const vol = computePortfolioVolatility(weightBySymbol, returns);

  const flags: string[] = [];
  if (topSector && topSector[1] > 0.4) {
    flags.push(`High concentration: ${(topSector[1] * 100).toFixed(0)}% in ${topSector[0]}.`);
  }

  return {
    holdings: snapHoldings,
    riskSnapshot: {
      beta: beta.beta,
      betaCoveredWeight: beta.coveredWeight,
      volatility: vol.volatility,
      hhi,
      topSector: topSector?.[0] ?? null,
      topSectorWeight: topSector?.[1] ?? null,
      concentrationFlags: flags,
    },
  };
}
