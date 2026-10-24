import type { HoldingWithData, PositionValue } from "./types";

/**
 * Pure portfolio concentration math. All weights are fractions of total
 * portfolio value (holdings with no current price are excluded from the value
 * base, so weights sum to 1 across priced holdings).
 */

const SECTOR_FLAG = 0.4; // > 40% in one sector
const SINGLE_FLAG = 0.25; // > 25% in one stock

/** Compute per-position value, weight, and P&L. */
export function positionValues(holdings: HoldingWithData[]): {
  positions: PositionValue[];
  totalValue: number;
} {
  const priced = holdings.filter((h) => h.currentPrice != null);
  const totalValue = priced.reduce(
    (sum, h) => sum + h.quantity * (h.currentPrice as number),
    0,
  );

  const positions: PositionValue[] = holdings.map((h) => {
    const value = h.currentPrice != null ? h.quantity * h.currentPrice : null;
    const cost = h.quantity * h.avgBuyPrice;
    const pnl = value != null ? value - cost : null;
    return {
      symbol: h.symbol,
      name: h.name,
      sector: h.sector,
      quantity: h.quantity,
      avgBuyPrice: h.avgBuyPrice,
      currentPrice: h.currentPrice,
      value,
      weight: value != null && totalValue > 0 ? value / totalValue : null,
      pnl,
      pnlPct: pnl != null && cost > 0 ? (pnl / cost) * 100 : null,
    };
  });

  return { positions, totalValue };
}

export interface SectorWeight {
  sector: string;
  weight: number;
}

export interface ConcentrationResult {
  sectorWeights: SectorWeight[];
  /** HHI across single-stock weights (0..1; higher = more concentrated). */
  hhi: number;
  flags: string[];
  topSector: SectorWeight | null;
  topStock: { symbol: string; weight: number } | null;
}

/** Sector weights, single-stock HHI, and concentration flags. */
export function computeConcentration(
  positions: PositionValue[],
): ConcentrationResult {
  const priced = positions.filter((p) => p.weight != null) as (PositionValue & {
    weight: number;
  })[];

  // Sector weights.
  const sectorMap = new Map<string, number>();
  for (const p of priced) {
    const sector = p.sector ?? "Unknown";
    sectorMap.set(sector, (sectorMap.get(sector) ?? 0) + p.weight);
  }
  const sectorWeights: SectorWeight[] = [...sectorMap.entries()]
    .map(([sector, weight]) => ({ sector, weight }))
    .sort((a, b) => b.weight - a.weight);

  // HHI across single-stock weights.
  const hhi = priced.reduce((sum, p) => sum + p.weight * p.weight, 0);

  // Flags.
  const flags: string[] = [];
  const topSector = sectorWeights[0] ?? null;
  if (topSector && topSector.weight > SECTOR_FLAG) {
    flags.push(
      `High concentration: ${(topSector.weight * 100).toFixed(0)}% in ${topSector.sector}.`,
    );
  }
  const topStockPos = [...priced].sort((a, b) => b.weight - a.weight)[0] ?? null;
  const topStock = topStockPos
    ? { symbol: topStockPos.symbol, weight: topStockPos.weight }
    : null;
  if (topStock && topStock.weight > SINGLE_FLAG) {
    flags.push(
      `High concentration: ${(topStock.weight * 100).toFixed(0)}% in ${topStock.symbol}.`,
    );
  }

  return { sectorWeights, hhi, flags, topSector, topStock };
}

export { SECTOR_FLAG, SINGLE_FLAG };
