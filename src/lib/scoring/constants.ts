/**
 * Shared scoring constants. Single source of truth for pillar weights, metric
 * definitions, red-flag rules, and label thresholds. Imported by the scoring
 * engine AND the methodology page so the published method always matches code.
 */

export const FORMULA_VERSION = "v1.0";

export type PillarKey =
  | "profitability"
  | "growth"
  | "financial_health"
  | "valuation"
  | "governance"
  | "stability";

/** Pillar weights (sum must equal 100). */
export const PILLAR_WEIGHTS: Record<PillarKey, number> = {
  profitability: 25,
  growth: 20,
  financial_health: 20,
  valuation: 15,
  governance: 10,
  stability: 10,
};

export const PILLAR_LABELS: Record<PillarKey, string> = {
  profitability: "Profitability",
  growth: "Growth",
  financial_health: "Financial Health",
  valuation: "Valuation",
  governance: "Governance",
  stability: "Stability",
};

/** "high" = higher is better; "low" = lower is better (percentile flipped). */
export type Direction = "high" | "low";

export interface MetricDef {
  /** Key into stock_metrics. */
  key: string;
  label: string;
  direction: Direction;
  /** Only applies to banks/NBFCs when false (skipped for them). */
  appliesToBanks?: boolean;
  /** Unit hint for explanations: "percent" | "x" | "ratio". */
  unit: "percent" | "x" | "ratio";
}

/**
 * Metric membership per pillar. Governance is rule-based (not percentile) and
 * handled separately. Valuation's PEG only counts when growth > 0 (handled in
 * code). Financial-health OCF/net-profit ratio is derived in code.
 */
export const PILLAR_METRICS: Record<
  Exclude<PillarKey, "governance">,
  MetricDef[]
> = {
  profitability: [
    { key: "roe", label: "ROE", direction: "high", unit: "percent", appliesToBanks: true },
    { key: "roce", label: "ROCE", direction: "high", unit: "percent", appliesToBanks: true },
    { key: "operating_margin", label: "Operating margin", direction: "high", unit: "percent", appliesToBanks: true },
  ],
  growth: [
    { key: "revenue_cagr_3y", label: "Revenue CAGR (3y)", direction: "high", unit: "percent", appliesToBanks: true },
    { key: "revenue_cagr_5y", label: "Revenue CAGR (5y)", direction: "high", unit: "percent", appliesToBanks: true },
    { key: "profit_cagr_3y", label: "Profit CAGR (3y)", direction: "high", unit: "percent", appliesToBanks: true },
    { key: "profit_cagr_5y", label: "Profit CAGR (5y)", direction: "high", unit: "percent", appliesToBanks: true },
  ],
  financial_health: [
    // debt_to_equity and the OCF/net-profit ratio are SKIPPED for banks/NBFCs.
    { key: "debt_to_equity", label: "Debt / Equity", direction: "low", unit: "x", appliesToBanks: false },
    { key: "interest_coverage", label: "Interest coverage", direction: "high", unit: "x", appliesToBanks: true },
    { key: "ocf_to_net_profit", label: "Operating cash flow / Net profit", direction: "high", unit: "x", appliesToBanks: false },
  ],
  valuation: [
    { key: "pe_rel_sector", label: "P/E vs sector median", direction: "low", unit: "x", appliesToBanks: true },
    { key: "peg", label: "PEG", direction: "low", unit: "x", appliesToBanks: true },
  ],
  stability: [
    { key: "volatility_1y", label: "1y volatility", direction: "low", unit: "percent", appliesToBanks: true },
    { key: "max_drawdown_3y", label: "3y max drawdown", direction: "low", unit: "percent", appliesToBanks: true },
  ],
};

/** OCF/net-profit ratio is capped at this value before percentile ranking. */
export const OCF_RATIO_CAP = 1.5;

/** Sectors treated as banks/NBFCs (skip D/E and OCF metrics, renormalize). */
export const BANK_SECTORS = new Set(["Banking", "NBFC", "Financial Services"]);

export function isBankSector(sector: string | null | undefined): boolean {
  return sector != null && BANK_SECTORS.has(sector);
}

/** Minimum peers (with a given metric) before falling back to the universe. */
export const MIN_PEERS = 4;

/** Red-flag cap: total score cannot exceed this when any flag triggers. */
export const RED_FLAG_CAP = 40;

/** data_confidence below this -> "Limited data". */
export const LIMITED_DATA_CONFIDENCE = 0.6;

/** Label thresholds. */
export const LABEL_THRESHOLDS = {
  strong: 70, // >= 70
  average: 40, // 40..69
  // < 40 -> Weak
} as const;

export const LABELS = {
  strong: "Strong fundamentals",
  average: "Average fundamentals",
  weak: "Weak fundamentals",
  limited: "Limited data",
} as const;

/** Governance scoring rules (documented for the methodology page). */
export const GOVERNANCE_RULES = {
  pledge: "0% pledge = 100, ≤10% = 80, ≤30% = 40, >30% = 0",
  auditor: "unqualified = 100; qualified/adverse/disclaimer = 0",
  relatedParty: "stable = 100, rising = 50, sharply_rising = 0",
  promoterHoldingChange: "worse than -5 points = 30, else 100",
} as const;

/** Red-flag definitions (documented for the methodology page). */
export const RED_FLAG_DEFINITIONS = [
  { code: "PLEDGE_HIGH", title: "High promoter pledge", rule: "Promoter pledge > 30%" },
  { code: "NEG_OCF_3Y", title: "Persistent negative cash flow", rule: "Negative operating cash flow in the 3 latest consecutive years" },
  { code: "AUDITOR_FLAG", title: "Adverse auditor opinion", rule: "Auditor opinion qualified / adverse / disclaimer" },
  { code: "RPT_SPIKE", title: "Rising related-party transactions", rule: "Related-party trend sharply rising" },
] as const;
