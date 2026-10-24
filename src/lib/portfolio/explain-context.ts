/**
 * Build a NEUTRAL data block describing a portfolio's risk, assembled entirely
 * from code-computed numbers (concentration, beta, volatility, correlation,
 * per-holding volatility contribution). Pure assembly — no LLM, no advice.
 *
 * The LLM only EXPLAINS this block in plain language; it never adds numbers.
 */
import type { PositionValue } from "./types";
import type { ConcentrationResult } from "./concentration";
import type { PortfolioBeta } from "./beta";
import type { VolatilityResult } from "./volatility";
import type {
  CorrelationResult,
  VolContributionResult,
} from "./correlation";

export interface PortfolioRiskData {
  totalValue: number;
  holdingCount: number;
  holdings: {
    symbol: string;
    sector: string | null;
    weightPct: number | null;
    volContributionPct: number | null;
  }[];
  concentration: {
    hhi: number;
    topSector: string | null;
    topSectorWeightPct: number | null;
    flags: string[];
  };
  beta: { value: number | null; coveredWeightPct: number };
  volatility: { annualisedPct: number | null; note: string | null };
  correlation: {
    averagePairwise: number | null;
    highestPair: { a: string; b: string; value: number } | null;
    note: string;
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Assemble the neutral risk-data block from already-computed results. */
export function buildPortfolioRiskData(params: {
  positions: PositionValue[];
  totalValue: number;
  concentration: ConcentrationResult;
  beta: PortfolioBeta;
  volatility: VolatilityResult;
  correlation: CorrelationResult;
  volContrib: VolContributionResult;
}): PortfolioRiskData {
  const { positions, totalValue, concentration, beta, volatility, correlation, volContrib } =
    params;

  const contribBySym = new Map(
    volContrib.contributions.map((c) => [c.symbol, c.contribution]),
  );

  const holdings = positions
    .filter((p) => p.weight != null)
    .map((p) => {
      const contrib = contribBySym.get(p.symbol);
      return {
        symbol: p.symbol,
        sector: p.sector,
        weightPct: p.weight != null ? r2((p.weight as number) * 100) : null,
        volContributionPct: contrib != null ? r2(contrib * 100) : null,
      };
    });

  // Highest available off-diagonal correlation pair.
  let highestPair: { a: string; b: string; value: number } | null = null;
  for (const c of correlation.pairs) {
    if (c.value != null && (highestPair == null || c.value > highestPair.value)) {
      highestPair = { a: c.a, b: c.b, value: r2(c.value) };
    }
  }

  return {
    totalValue: r2(totalValue),
    holdingCount: holdings.length,
    holdings,
    concentration: {
      hhi: r2(concentration.hhi),
      topSector: concentration.topSector?.sector ?? null,
      topSectorWeightPct:
        concentration.topSector?.weight != null
          ? r2(concentration.topSector.weight * 100)
          : null,
      flags: concentration.flags,
    },
    beta: {
      value: beta.beta != null ? r2(beta.beta) : null,
      coveredWeightPct: r2(beta.coveredWeight * 100),
    },
    volatility: {
      annualisedPct: volatility.volatility != null ? r2(volatility.volatility * 100) : null,
      note:
        volatility.volatility == null
          ? volatility.reason === "insufficient_history"
            ? `Not available: need >=60 overlapping days; have ${volatility.overlapDays}.`
            : "Not available."
          : null,
    },
    correlation: {
      averagePairwise:
        correlation.averageCorrelation != null ? r2(correlation.averageCorrelation) : null,
      highestPair,
      note:
        "Correlation is historical (1y daily returns) over dates common to each pair; pairs with under 60 overlapping days are omitted.",
    },
  };
}
