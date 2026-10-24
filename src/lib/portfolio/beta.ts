import type { PositionValue } from "./types";

export interface PortfolioBeta {
  /** Weighted beta over holdings with a known beta. */
  beta: number | null;
  /** Fraction of portfolio value covered by holdings with a beta. */
  coveredWeight: number;
}

/**
 * Portfolio beta = Σ (weight × beta), skipping holdings with a null beta.
 * Weights are RENORMALISED over the covered holdings so the weighted average is
 * meaningful; coveredWeight reports how much of the portfolio that represents.
 */
export function computePortfolioBeta(
  positions: PositionValue[],
  betaBySymbol: Map<string, number | null>,
): PortfolioBeta {
  const priced = positions.filter((p) => p.weight != null) as (PositionValue & {
    weight: number;
  })[];

  const covered = priced.filter((p) => {
    const b = betaBySymbol.get(p.symbol);
    return b != null && Number.isFinite(b);
  });

  const coveredWeight = covered.reduce((s, p) => s + p.weight, 0);
  if (coveredWeight === 0) return { beta: null, coveredWeight: 0 };

  const beta =
    covered.reduce(
      (s, p) => s + (p.weight / coveredWeight) * (betaBySymbol.get(p.symbol) as number),
      0,
    );

  return { beta, coveredWeight };
}
