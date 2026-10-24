import {
  PILLAR_WEIGHTS,
  PILLAR_METRICS,
  OCF_RATIO_CAP,
  ALTMAN_ZONE_POINTS,
  MIN_PEERS,
  RED_FLAG_CAP,
  LIMITED_DATA_CONFIDENCE,
  LABEL_THRESHOLDS,
  LABELS,
  FORMULA_VERSION,
  isBankSector,
  type PillarKey,
} from "./constants";
import { percentileRank } from "./percentile";
import { scoreGovernance, type GovernanceInput } from "./governance";
import { evaluateRedFlags, INFORMATIONAL_RED_FLAG_CODES } from "./red-flags";
import { describePercentile, describeMissing } from "./explanations";
import type { AltmanZone, RedFlag, ScoreExplanations } from "@/types/database";

/** Metric values used for scoring one stock (derived, sector-relative). */
export interface ScoringMetrics {
  roe: number | null;
  roce: number | null;
  operating_margin: number | null;
  revenue_cagr_3y: number | null;
  revenue_cagr_5y: number | null;
  profit_cagr_3y: number | null;
  profit_cagr_5y: number | null;
  debt_to_equity: number | null;
  interest_coverage: number | null;
  /** operating_cash_flow / net_profit, capped at OCF_RATIO_CAP. */
  ocf_to_net_profit: number | null;
  /** pe relative to sector median (pe / sectorMedianPe). */
  pe_rel_sector: number | null;
  peg: number | null;
  volatility_1y: number | null;
  max_drawdown_3y: number | null;
  /** Piotroski F-Score (0-9), percentile-ranked in financial_health. */
  piotroski_score: number | null;
}

export interface StockForScoring {
  stock_id: string;
  symbol: string;
  sector: string | null;
  metrics: ScoringMetrics;
  growthPillarPositive: boolean; // whether profit CAGR 3y > 0 (gates PEG)
  governance: GovernanceInput | null;
  recentOcf: (number | null)[]; // 3 latest OCF values for red flag
  /** Altman Z'' zone, folded into financial_health as direct points. */
  altmanZone: AltmanZone | null;
  /** Piotroski F-Score, used for the informational red flag. */
  piotroskiScore: number | null;
}

export interface ScoreResult {
  stock_id: string;
  total_score: number;
  label: string;
  profitability: number | null;
  growth: number | null;
  financial_health: number | null;
  valuation: number | null;
  governance: number | null;
  stability: number | null;
  red_flags: RedFlag[];
  capped: boolean;
  data_confidence: number;
  sector_peer_count: number;
  explanations: ScoreExplanations;
  formula_version: string;
  low_peer_count: boolean;
}

type MetricKey = keyof ScoringMetrics;

/** Peer values for a metric across a group of stocks (nulls dropped). */
function peerValues(
  group: StockForScoring[],
  key: MetricKey,
): number[] {
  return group
    .map((s) => s.metrics[key])
    .filter((v): v is number => v != null && Number.isFinite(v));
}

/**
 * Score a whole peer group (same sector). `universe` is the full set used for
 * small-peer fallback. Returns one ScoreResult per stock.
 */
export function scoreGroup(
  group: StockForScoring[],
  universe: StockForScoring[],
): ScoreResult[] {
  return group.map((stock) =>
    scoreStock(stock, group, universe, group.length),
  );
}

function scoreStock(
  stock: StockForScoring,
  sectorGroup: StockForScoring[],
  universe: StockForScoring[],
  sectorPeerCount: number,
): ScoreResult {
  const bank = isBankSector(stock.sector);
  const explanations: ScoreExplanations = {};
  let lowPeerCount = false;

  // Track data confidence across percentile + governance pillars.
  let expectedMetrics = 0;
  let availableMetrics = 0;

  const pillarScores: Partial<Record<PillarKey, number | null>> = {};

  // --- Percentile-based pillars ---
  (Object.keys(PILLAR_METRICS) as Exclude<PillarKey, "governance">[]).forEach(
    (pillar) => {
      const defs = PILLAR_METRICS[pillar].filter(
        (d) => !bank || d.appliesToBanks !== false,
      );

      const pctScores: number[] = [];
      const sentences: string[] = [];

      for (const def of defs) {
        const key = def.key as MetricKey;
        expectedMetrics++;

        // PEG only counts when growth is positive.
        if (key === "peg" && !stock.growthPillarPositive) {
          sentences.push(describeMissing(def.label));
          continue;
        }

        const raw = stock.metrics[key];
        if (raw == null || !Number.isFinite(raw)) {
          sentences.push(describeMissing(def.label));
          continue;
        }

        // Peer group: sector first; fall back to universe if too few peers.
        let peers = peerValues(sectorGroup, key);
        if (peers.length < MIN_PEERS) {
          peers = peerValues(universe, key);
          lowPeerCount = true;
        }

        const pct = percentileRank(raw, peers, def.direction);
        if (pct == null) {
          sentences.push(describeMissing(def.label));
          continue;
        }

        availableMetrics++;
        pctScores.push(pct);
        sentences.push(
          describePercentile(def.label, raw, def.unit, pct, def.direction),
        );
      }

      // Altman Z'' contributes DIRECT points (not percentile) to financial
      // health. Counts as one expected metric for this non-bank pillar.
      if (pillar === "financial_health" && !bank) {
        expectedMetrics++;
        const altmanPts =
          stock.altmanZone === "safe"
            ? ALTMAN_ZONE_POINTS.safe
            : stock.altmanZone === "grey"
              ? ALTMAN_ZONE_POINTS.grey
              : stock.altmanZone === "distress"
                ? ALTMAN_ZONE_POINTS.distress
                : null;
        if (altmanPts != null) {
          availableMetrics++;
          pctScores.push(altmanPts);
          sentences.push(
            `Altman Z''-Score is in the ${stock.altmanZone} zone (historical distress indicator, not a prediction).`,
          );
        } else {
          sentences.push(describeMissing("Altman Z''-Score"));
        }
      }

      explanations[pillar] = sentences;
      pillarScores[pillar] =
        pctScores.length > 0
          ? pctScores.reduce((a, b) => a + b, 0) / pctScores.length
          : null;
    },
  );

  // --- Governance pillar (rule-based) ---
  expectedMetrics++; // governance counts as one expected "metric" group
  const govScore = scoreGovernance(stock.governance);
  if (govScore != null) availableMetrics++;
  pillarScores.governance = govScore;
  explanations.governance = buildGovernanceSentences(stock.governance, govScore);

  // --- Weighted total with proportional redistribution of missing pillars ---
  const presentPillars = (Object.keys(PILLAR_WEIGHTS) as PillarKey[]).filter(
    (p) => pillarScores[p] != null,
  );
  const presentWeight = presentPillars.reduce(
    (sum, p) => sum + PILLAR_WEIGHTS[p],
    0,
  );

  let total = 0;
  if (presentWeight > 0) {
    for (const p of presentPillars) {
      const renorm = PILLAR_WEIGHTS[p] / presentWeight; // redistribute
      total += (pillarScores[p] as number) * renorm;
    }
  }
  total = Math.round(total * 10) / 10;

  // --- Red flags + cap ---
  const redFlags = evaluateRedFlags({
    governance: stock.governance,
    recentOcf: stock.recentOcf,
    altmanZone: stock.altmanZone,
    piotroskiScore: stock.piotroskiScore,
  });
  // Only NON-informational flags (governance / cash flow) cap the score.
  const cappingFlags = redFlags.filter(
    (f) => !INFORMATIONAL_RED_FLAG_CODES.has(f.code),
  );
  const capped = cappingFlags.length > 0 && total > RED_FLAG_CAP;
  if (capped) total = RED_FLAG_CAP;

  // --- data confidence + label ---
  const dataConfidence =
    expectedMetrics > 0 ? availableMetrics / expectedMetrics : 0;

  const label = labelFor(total, dataConfidence);

  return {
    stock_id: stock.stock_id,
    total_score: total,
    label,
    profitability: round1(pillarScores.profitability ?? null),
    growth: round1(pillarScores.growth ?? null),
    financial_health: round1(pillarScores.financial_health ?? null),
    valuation: round1(pillarScores.valuation ?? null),
    governance: round1(pillarScores.governance ?? null),
    stability: round1(pillarScores.stability ?? null),
    red_flags: redFlags,
    capped,
    data_confidence: Math.round(dataConfidence * 100) / 100,
    sector_peer_count: sectorPeerCount,
    explanations,
    formula_version: FORMULA_VERSION,
    low_peer_count: lowPeerCount,
  };
}

function round1(v: number | null): number | null {
  return v == null ? null : Math.round(v * 10) / 10;
}

/** Label from total + confidence. */
export function labelFor(total: number, dataConfidence: number): string {
  if (dataConfidence < LIMITED_DATA_CONFIDENCE) return LABELS.limited;
  if (total >= LABEL_THRESHOLDS.strong) return LABELS.strong;
  if (total >= LABEL_THRESHOLDS.average) return LABELS.average;
  return LABELS.weak;
}

function buildGovernanceSentences(
  g: GovernanceInput | null,
  score: number | null,
): string[] {
  if (!g || score == null) {
    return ["Governance: not enough data to score."];
  }
  const parts: string[] = [];
  if (g.promoter_pledge_pct != null) {
    parts.push(`Promoter pledge is ${g.promoter_pledge_pct}%.`);
  }
  if (g.auditor_opinion && g.auditor_opinion !== "unknown") {
    parts.push(`Auditor opinion is ${g.auditor_opinion}.`);
  }
  if (g.related_party_trend && g.related_party_trend !== "unknown") {
    parts.push(
      `Related-party transactions are ${g.related_party_trend.replace("_", " ")}.`,
    );
  }
  if (g.promoter_holding_change_1y != null) {
    parts.push(
      `Promoter holding changed ${g.promoter_holding_change_1y > 0 ? "+" : ""}${g.promoter_holding_change_1y} points over the past year.`,
    );
  }
  if (parts.length === 0) parts.push("Governance: limited data available.");
  return parts;
}

/** Cap the OCF/net-profit ratio at OCF_RATIO_CAP (keeps extreme values bounded). */
export function cappedOcfRatio(
  ocf: number | null,
  netProfit: number | null,
): number | null {
  if (ocf == null || netProfit == null || netProfit === 0) return null;
  const ratio = ocf / netProfit;
  if (!Number.isFinite(ratio)) return null;
  return Math.min(ratio, OCF_RATIO_CAP);
}
