/**
 * Deterministic, documented goal-conflict checks. Pure — no I/O, no LLM.
 *
 * Each rule compares a stated investor profile (risk tolerance, horizon,
 * liquidity need) against observed portfolio characteristics and raises a
 * NEUTRAL, non-advice warning when they conflict. Wording never tells the user
 * what to trade; it describes the conflict and the numbers, using "you may want
 * to review" at most.
 */

export type RiskTolerance = "conservative" | "moderate" | "aggressive";

export interface PortfolioProfile {
  riskTolerance: RiskTolerance;
  horizonYears: number; // 1..40
  liquidityNeedPct: number; // 0..100 (share possibly needed within 12 months)
}

export interface PortfolioObservations {
  beta: number | null;
  volatility: number | null; // annualised fraction (e.g. 0.28)
  smallCapWeight: number; // fraction 0..1
  topSectorWeight: number; // fraction 0..1
  topSectorName: string | null;
  /** Weight in small-cap OR thin-float holdings used for liquidity check. */
  illiquidWeight: number; // fraction 0..1
}

export interface GoalConflict {
  code: string;
  message: string;
  rule: string;
  numbers: string;
}

/** Documented thresholds (surfaced in the Assumptions panel / methodology). */
export const CONFLICT_THRESHOLDS = {
  shortHorizonYears: 3,
  highBeta: 1.0,
  smallCapWeightShortHorizon: 0.3,
  liquidityNeedPct: 20,
  illiquidWeight: 0.4,
  conservativeVolatility: 0.3, // 30% annualised
  concentratedSector: 0.4,
  aggressiveShortHorizonYears: 2,
} as const;

const pct = (f: number) => `${(f * 100).toFixed(0)}%`;

/**
 * Evaluate all goal-conflict rules. Each rule fires only when its inputs are
 * available (null metrics skip the rule rather than guessing).
 */
export function evaluateGoalConflicts(
  profile: PortfolioProfile,
  obs: PortfolioObservations,
): GoalConflict[] {
  const t = CONFLICT_THRESHOLDS;
  const out: GoalConflict[] = [];

  // 1. Short horizon with high beta or heavy small-cap exposure.
  if (profile.horizonYears < t.shortHorizonYears) {
    if (obs.beta != null && obs.beta > t.highBeta) {
      out.push({
        code: "SHORT_HORIZON_HIGH_BETA",
        message: `Your horizon is under ${t.shortHorizonYears} years, but the portfolio is more volatile than the market. You may want to review this mismatch.`,
        rule: `horizon < ${t.shortHorizonYears}y AND portfolio beta > ${t.highBeta}`,
        numbers: `horizon ${profile.horizonYears}y, beta ${obs.beta.toFixed(2)}`,
      });
    }
    if (obs.smallCapWeight > t.smallCapWeightShortHorizon) {
      out.push({
        code: "SHORT_HORIZON_SMALLCAP",
        message: `Your horizon is under ${t.shortHorizonYears} years with a high small-cap weight, which tends to swing more over short periods.`,
        rule: `horizon < ${t.shortHorizonYears}y AND small-cap weight > ${pct(t.smallCapWeightShortHorizon)}`,
        numbers: `horizon ${profile.horizonYears}y, small-cap ${pct(obs.smallCapWeight)}`,
      });
    }
  }

  // 2. High near-term liquidity need against illiquid/small-cap exposure.
  if (
    profile.liquidityNeedPct > t.liquidityNeedPct &&
    obs.illiquidWeight > t.illiquidWeight
  ) {
    out.push({
      code: "LIQUIDITY_VS_ILLIQUID",
      message: `You may need ${profile.liquidityNeedPct}% within 12 months, but a large share sits in small-cap or thinly-traded holdings that can be harder to exit quickly.`,
      rule: `liquidity need > ${t.liquidityNeedPct}% AND small-cap/illiquid weight > ${pct(t.illiquidWeight)}`,
      numbers: `liquidity need ${profile.liquidityNeedPct}%, illiquid ${pct(obs.illiquidWeight)}`,
    });
  }

  // 3. Conservative tolerance but high volatility or sector concentration.
  if (profile.riskTolerance === "conservative") {
    if (obs.volatility != null && obs.volatility > t.conservativeVolatility) {
      out.push({
        code: "CONSERVATIVE_HIGH_VOL",
        message: `You picked a conservative profile, but the portfolio's historical volatility is relatively high.`,
        rule: `tolerance = conservative AND 1y volatility > ${pct(t.conservativeVolatility)}`,
        numbers: `volatility ${pct(obs.volatility)}`,
      });
    }
    if (obs.topSectorWeight > t.concentratedSector) {
      out.push({
        code: "CONSERVATIVE_CONCENTRATED",
        message: `You picked a conservative profile, but over ${pct(t.concentratedSector)} sits in one sector${obs.topSectorName ? ` (${obs.topSectorName})` : ""}.`,
        rule: `tolerance = conservative AND top sector weight > ${pct(t.concentratedSector)}`,
        numbers: `${obs.topSectorName ?? "top sector"} ${pct(obs.topSectorWeight)}`,
      });
    }
  }

  // 4. Aggressive tolerance with a very short horizon.
  if (
    profile.riskTolerance === "aggressive" &&
    profile.horizonYears < t.aggressiveShortHorizonYears
  ) {
    out.push({
      code: "AGGRESSIVE_SHORT_HORIZON",
      message: `An aggressive profile with a horizon under ${t.aggressiveShortHorizonYears} years is a mismatch: higher-risk holdings need time to ride out swings.`,
      rule: `tolerance = aggressive AND horizon < ${t.aggressiveShortHorizonYears}y`,
      numbers: `horizon ${profile.horizonYears}y`,
    });
  }

  return out;
}
