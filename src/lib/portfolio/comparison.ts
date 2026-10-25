/**
 * Allocation comparison: summarise an allocation (current OR a user-built
 * alternative) into the figures shown side by side. Pure math — no I/O.
 *
 * An allocation is a list of { symbol, sector, value, weight, beta } positions.
 * This reuses concentration + beta logic and a chosen scenario's loss so the UI
 * can show Current vs Alternative and the delta for each metric.
 */
import type { PositionValue } from "./types";
import { computeConcentration } from "./concentration";
import { computePortfolioBeta } from "./beta";
import { runScenario, type Scenario, type ScenarioAssumptions } from "./scenarios";

export interface AllocationSummary {
  totalValue: number;
  sectorWeights: { sector: string; weight: number }[];
  concentrationFlags: string[];
  hhi: number;
  beta: number | null;
  /** Scenario loss (signed % of portfolio) for the selected scenario. */
  scenarioImpactPct: number;
  scenarioImpactValue: number;
}

export interface AllocationComparison {
  current: AllocationSummary;
  alternative: AllocationSummary;
  delta: {
    hhi: number;
    beta: number | null;
    scenarioImpactPct: number;
    topSectorWeight: number;
  };
}

function summarise(
  positions: PositionValue[],
  betaBySymbol: Map<string, number | null>,
  scenario: Scenario,
  assumptions?: ScenarioAssumptions,
): AllocationSummary {
  const totalValue = positions.reduce((s, p) => s + (p.value ?? 0), 0);
  const conc = computeConcentration(positions);
  const { beta } = computePortfolioBeta(positions, betaBySymbol);
  const sc = runScenario(positions, betaBySymbol, scenario, assumptions);
  return {
    totalValue,
    sectorWeights: conc.sectorWeights,
    concentrationFlags: conc.flags,
    hhi: conc.hhi,
    beta,
    scenarioImpactPct: sc.totalImpactPct,
    scenarioImpactValue: sc.totalImpactValue,
  };
}

export function compareAllocations(
  current: PositionValue[],
  alternative: PositionValue[],
  betaBySymbol: Map<string, number | null>,
  scenario: Scenario,
  assumptions?: ScenarioAssumptions,
): AllocationComparison {
  const c = summarise(current, betaBySymbol, scenario, assumptions);
  const a = summarise(alternative, betaBySymbol, scenario, assumptions);
  const topC = c.sectorWeights[0]?.weight ?? 0;
  const topA = a.sectorWeights[0]?.weight ?? 0;
  return {
    current: c,
    alternative: a,
    delta: {
      hhi: a.hhi - c.hhi,
      beta: a.beta != null && c.beta != null ? a.beta - c.beta : null,
      scenarioImpactPct: a.scenarioImpactPct - c.scenarioImpactPct,
      topSectorWeight: topA - topC,
    },
  };
}
