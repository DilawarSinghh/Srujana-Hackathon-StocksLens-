import type { PositionValue } from "./types";

/**
 * Market-drop stress test. HYPOTHETICAL estimate using historical beta —
 * NOT a prediction.
 *
 * Per holding: estimated loss = weight_value × beta × marketShock.
 * marketShock is a fraction (e.g. -0.10 for a 10% market drop).
 * Holdings with a null beta are assumed to move with the market (beta = 1) so
 * the estimate is not artificially optimistic; this is noted in the UI.
 */

export interface StressHoldingImpact {
  symbol: string;
  value: number;
  beta: number;
  betaAssumed: boolean;
  estimatedLoss: number; // negative number
  estimatedLossPct: number; // negative percent of that holding's value
}

export interface StressResult {
  marketShockPct: number; // e.g. -10
  totalValue: number;
  estimatedLoss: number; // negative ₹
  estimatedLossPct: number; // negative % of portfolio
  perHolding: StressHoldingImpact[];
}

export function computeStress(
  positions: PositionValue[],
  betaBySymbol: Map<string, number | null>,
  marketShockPct: number,
): StressResult {
  const shock = marketShockPct / 100;
  const priced = positions.filter(
    (p) => p.value != null && p.value > 0,
  ) as (PositionValue & { value: number })[];

  const totalValue = priced.reduce((s, p) => s + p.value, 0);

  const perHolding: StressHoldingImpact[] = priced.map((p) => {
    const rawBeta = betaBySymbol.get(p.symbol);
    const betaAssumed = rawBeta == null || !Number.isFinite(rawBeta);
    const beta = betaAssumed ? 1 : (rawBeta as number);
    const estimatedLoss = p.value * beta * shock;
    const estimatedLossPct = beta * shock * 100;
    return {
      symbol: p.symbol,
      value: p.value,
      beta,
      betaAssumed,
      estimatedLoss,
      estimatedLossPct,
    };
  });

  const estimatedLoss = perHolding.reduce((s, h) => s + h.estimatedLoss, 0);
  const estimatedLossPct =
    totalValue > 0 ? (estimatedLoss / totalValue) * 100 : 0;

  return {
    marketShockPct,
    totalValue,
    estimatedLoss,
    estimatedLossPct,
    perHolding,
  };
}
