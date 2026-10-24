/**
 * Hypothetical scenario engine. Pure math — no I/O, no LLM. Every result is a
 * HYPOTHETICAL estimate based on stated assumptions, never a prediction.
 *
 * One entry point, `runScenario(positions, betaBySymbol, scenario, assumptions)`,
 * returns per-holding and total impact in % and ₹ for each scenario type:
 *   - market_decline: beta-scaled broad market move (reuses the stress logic)
 *   - sector_shock:   chosen sector takes the shock; others take beta × shock × spillover
 *   - rate_change:    −(assumed sector rate sensitivity × bps/100)%
 *   - currency_move:  assumed sector USD/INR exposure × rupee move %
 */
import type { PositionValue } from "./types";
import {
  RATE_SENSITIVITY,
  DEFAULT_RATE_SENSITIVITY,
  CURRENCY_EXPOSURE,
  DEFAULT_CURRENCY_EXPOSURE,
  DEFAULT_SPILLOVER,
} from "@/config/scenario-assumptions";

export type Scenario =
  | { type: "market_decline"; marketShockPct: number }
  | { type: "sector_shock"; sector: string; shockPct: number; spillover?: number }
  | { type: "rate_change"; bps: number }
  | { type: "currency_move"; movePct: number };

/** Editable copies of the assumption tables (UI can override defaults). */
export interface ScenarioAssumptions {
  rateSensitivity: Record<string, number>;
  defaultRateSensitivity: number;
  currencyExposure: Record<string, number>;
  defaultCurrencyExposure: number;
  spillover: number;
}

export function defaultAssumptions(): ScenarioAssumptions {
  return {
    rateSensitivity: { ...RATE_SENSITIVITY },
    defaultRateSensitivity: DEFAULT_RATE_SENSITIVITY,
    currencyExposure: { ...CURRENCY_EXPOSURE },
    defaultCurrencyExposure: DEFAULT_CURRENCY_EXPOSURE,
    spillover: DEFAULT_SPILLOVER,
  };
}

export interface ScenarioHoldingImpact {
  symbol: string;
  sector: string | null;
  value: number;
  impactPct: number; // signed % of this holding's value
  impactValue: number; // signed ₹
  /** True when an assumed value (beta=1, default sensitivity) was used. */
  assumed: boolean;
}

export interface ScenarioResult {
  scenario: Scenario;
  totalValue: number;
  totalImpactValue: number; // signed ₹
  totalImpactPct: number; // signed % of portfolio
  perHolding: ScenarioHoldingImpact[];
}

const DISCLAIMER =
  "Hypothetical estimate based on stated assumptions. Not a prediction.";
export const SCENARIO_DISCLAIMER = DISCLAIMER;

function pricedPositions(
  positions: PositionValue[],
): (PositionValue & { value: number })[] {
  return positions.filter(
    (p) => p.value != null && p.value > 0,
  ) as (PositionValue & { value: number })[];
}

export function runScenario(
  positions: PositionValue[],
  betaBySymbol: Map<string, number | null>,
  scenario: Scenario,
  assumptions: ScenarioAssumptions = defaultAssumptions(),
): ScenarioResult {
  const priced = pricedPositions(positions);
  const totalValue = priced.reduce((s, p) => s + p.value, 0);

  const beta = (sym: string): { beta: number; assumed: boolean } => {
    const b = betaBySymbol.get(sym);
    return b != null && Number.isFinite(b)
      ? { beta: b as number, assumed: false }
      : { beta: 1, assumed: true };
  };

  const perHolding: ScenarioHoldingImpact[] = priced.map((p) => {
    let impactPct = 0;
    let assumed = false;

    if (scenario.type === "market_decline") {
      const { beta: bt, assumed: a } = beta(p.symbol);
      impactPct = bt * scenario.marketShockPct;
      assumed = a;
    } else if (scenario.type === "sector_shock") {
      const spillover = scenario.spillover ?? assumptions.spillover;
      if ((p.sector ?? "") === scenario.sector) {
        impactPct = scenario.shockPct; // direct shock
      } else {
        const { beta: bt, assumed: a } = beta(p.symbol);
        impactPct = bt * scenario.shockPct * spillover; // spillover
        assumed = a;
      }
    } else if (scenario.type === "rate_change") {
      const sens =
        assumptions.rateSensitivity[p.sector ?? ""] ??
        assumptions.defaultRateSensitivity;
      assumed = !(p.sector != null && p.sector in assumptions.rateSensitivity);
      // sensitivity is % change per +100 bps; already signed (negative).
      impactPct = sens * (scenario.bps / 100);
    } else {
      // currency_move: exposure is % change per +1% rupee depreciation.
      const exp =
        assumptions.currencyExposure[p.sector ?? ""] ??
        assumptions.defaultCurrencyExposure;
      assumed = !(p.sector != null && p.sector in assumptions.currencyExposure);
      impactPct = exp * scenario.movePct;
    }

    const impactValue = p.value * (impactPct / 100);
    return {
      symbol: p.symbol,
      sector: p.sector,
      value: p.value,
      impactPct,
      impactValue,
      assumed,
    };
  });

  const totalImpactValue = perHolding.reduce((s, h) => s + h.impactValue, 0);
  const totalImpactPct =
    totalValue > 0 ? (totalImpactValue / totalValue) * 100 : 0;

  return {
    scenario,
    totalValue,
    totalImpactValue,
    totalImpactPct,
    perHolding,
  };
}
