/**
 * Financial-quality scoring: Piotroski F-Score, Altman Z''-Score, and dividend
 * payout/safety. Pure functions — NO I/O, NO LLM. Code computes everything.
 *
 * Rules (shared with src/lib/data/metrics.ts):
 *  - Never invent or default values. Missing/invalid inputs → null (or the
 *    explicit "not_applicable"/"not_available" sentinels where specified).
 *  - Money inputs are INR crore; the units cancel in every ratio here.
 *  - Banks and NBFCs are skipped (their balance sheets make these models
 *    inapplicable).
 *
 * Piotroski logic adapted from Nipun-AI (MIT License). See NOTICE.md.
 * (Adapted = the idea of a 9-criterion health score; the single-year proxy in
 * Nipun-AI is replaced here with the real year-over-year criteria.)
 */
import type { AltmanZone, DividendSafety } from "@/types/database";

function isNum(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

/** One fiscal year of the fundamentals needed for quality scoring. */
export interface QualityFundamentals {
  revenue: number | null;
  net_profit: number | null;
  operating_cash_flow: number | null;
  total_assets: number | null;
  current_assets: number | null;
  current_liabilities: number | null;
  long_term_debt: number | null;
  total_liabilities: number | null;
  retained_earnings: number | null;
  total_equity: number | null;
  ebit: number | null;
  gross_profit: number | null;
  dividends_paid: number | null;
  shares_outstanding: number | null;
}

// ---------------------------------------------------------------------------
// Piotroski F-Score (real year-over-year, 0-9)
// ---------------------------------------------------------------------------

export interface PiotroskiResult {
  /** 0-9, or null when fewer than 6 criteria could be evaluated. */
  score: number | null;
  /** How many of the 9 criteria had enough data to be evaluated. */
  availableCriteria: number;
  /** Per-criterion outcome for the UI checklist. null = could not evaluate. */
  criteria: { label: string; passed: boolean | null }[];
}

const PIOTROSKI_MIN_CRITERIA = 6;

// Adapted from Nipun-AI (MIT License). See NOTICE.md.
/**
 * Real Piotroski F-Score from the current and prior fiscal year.
 * One point each for 9 criteria; a criterion with missing inputs is SKIPPED
 * (not scored 0). If fewer than 6 criteria are available the score is null.
 */
export function computePiotroski(
  current: QualityFundamentals,
  prior: QualityFundamentals,
): PiotroskiResult {
  const criteria: { label: string; passed: boolean | null }[] = [];

  const roa = (f: QualityFundamentals): number | null =>
    isNum(f.net_profit) && isNum(f.total_assets) && f.total_assets !== 0
      ? f.net_profit / f.total_assets
      : null;
  const currentRatio = (f: QualityFundamentals): number | null =>
    isNum(f.current_assets) &&
    isNum(f.current_liabilities) &&
    f.current_liabilities !== 0
      ? f.current_assets / f.current_liabilities
      : null;
  const ltDebtRatio = (f: QualityFundamentals): number | null =>
    isNum(f.long_term_debt) && isNum(f.total_assets) && f.total_assets !== 0
      ? f.long_term_debt / f.total_assets
      : null;
  const grossMargin = (f: QualityFundamentals): number | null =>
    isNum(f.gross_profit) && isNum(f.revenue) && f.revenue !== 0
      ? f.gross_profit / f.revenue
      : null;
  const assetTurnover = (f: QualityFundamentals): number | null =>
    isNum(f.revenue) && isNum(f.total_assets) && f.total_assets !== 0
      ? f.revenue / f.total_assets
      : null;

  // Profitability -----------------------------------------------------------
  // 1. ROA > 0 (positive net income relative to assets).
  const roaCur = roa(current);
  criteria.push({ label: "Return on assets is positive", passed: roaCur == null ? null : roaCur > 0 });

  // 2. Operating cash flow > 0.
  criteria.push({
    label: "Operating cash flow is positive",
    passed: isNum(current.operating_cash_flow) ? current.operating_cash_flow > 0 : null,
  });

  // 3. ROA improved year over year.
  const roaPrior = roa(prior);
  criteria.push({
    label: "Return on assets improved vs last year",
    passed: roaCur == null || roaPrior == null ? null : roaCur > roaPrior,
  });

  // 4. Operating cash flow > net income (accrual quality).
  criteria.push({
    label: "Cash flow exceeds reported profit",
    passed:
      isNum(current.operating_cash_flow) && isNum(current.net_profit)
        ? current.operating_cash_flow > current.net_profit
        : null,
  });

  // Leverage / liquidity / dilution -----------------------------------------
  // 5. Long-term debt ratio decreased.
  const ltCur = ltDebtRatio(current);
  const ltPrior = ltDebtRatio(prior);
  criteria.push({
    label: "Long-term debt ratio decreased",
    passed: ltCur == null || ltPrior == null ? null : ltCur < ltPrior,
  });

  // 6. Current ratio improved.
  const crCur = currentRatio(current);
  const crPrior = currentRatio(prior);
  criteria.push({
    label: "Current ratio improved",
    passed: crCur == null || crPrior == null ? null : crCur > crPrior,
  });

  // 7. No new shares issued (shares outstanding did not increase).
  criteria.push({
    label: "No dilution (shares did not increase)",
    passed:
      isNum(current.shares_outstanding) && isNum(prior.shares_outstanding)
        ? current.shares_outstanding <= prior.shares_outstanding
        : null,
  });

  // Operating efficiency -----------------------------------------------------
  // 8. Gross margin improved.
  const gmCur = grossMargin(current);
  const gmPrior = grossMargin(prior);
  criteria.push({
    label: "Gross margin improved",
    passed: gmCur == null || gmPrior == null ? null : gmCur > gmPrior,
  });

  // 9. Asset turnover improved.
  const atCur = assetTurnover(current);
  const atPrior = assetTurnover(prior);
  criteria.push({
    label: "Asset turnover improved",
    passed: atCur == null || atPrior == null ? null : atCur > atPrior,
  });

  const evaluated = criteria.filter((c) => c.passed != null);
  const availableCriteria = evaluated.length;
  const score =
    availableCriteria >= PIOTROSKI_MIN_CRITERIA
      ? evaluated.filter((c) => c.passed === true).length
      : null;

  return { score, availableCriteria, criteria };
}

// ---------------------------------------------------------------------------
// Altman Z''-Score (emerging-market / non-manufacturing variant)
// ---------------------------------------------------------------------------

export interface AltmanResult {
  /** The Z''-Score, or null if any input is missing. */
  z: number | null;
  zone: AltmanZone;
}

/**
 * Altman Z'' = 6.56·X1 + 3.26·X2 + 6.72·X3 + 1.05·X4
 *   X1 = working capital / total assets
 *   X2 = retained earnings / total assets
 *   X3 = EBIT / total assets
 *   X4 = book equity / total liabilities
 * Zones: >2.6 safe, 1.1-2.6 grey, <1.1 distress.
 * Returns z=null / zone="not_applicable" for banks/NBFCs; z=null with a zone of
 * "distress"/"grey"/"safe" is impossible — any missing input yields z=null and
 * the zone is left as the computed band only when z is finite.
 */
export function computeAltmanZDoublePrime(
  f: QualityFundamentals,
  isBank: boolean,
): AltmanResult {
  if (isBank) return { z: null, zone: "not_applicable" };

  const ta = f.total_assets;
  const tl = f.total_liabilities;
  if (
    !isNum(f.current_assets) ||
    !isNum(f.current_liabilities) ||
    !isNum(f.retained_earnings) ||
    !isNum(f.ebit) ||
    !isNum(f.total_equity) ||
    !isNum(ta) ||
    ta === 0 ||
    !isNum(tl) ||
    tl === 0
  ) {
    return { z: null, zone: "not_applicable" };
  }

  const workingCapital = f.current_assets - f.current_liabilities;
  const x1 = workingCapital / ta;
  const x2 = f.retained_earnings / ta;
  const x3 = f.ebit / ta;
  const x4 = f.total_equity / tl;

  const z = 6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4;
  const rounded = Math.round(z * 100) / 100;

  const zone: AltmanZone =
    rounded > 2.6 ? "safe" : rounded >= 1.1 ? "grey" : "distress";

  return { z: rounded, zone };
}

// ---------------------------------------------------------------------------
// Dividend payout & safety
// ---------------------------------------------------------------------------

export interface DividendResult {
  /** Payout ratio as a fraction (e.g. 0.45 = 45%), or null if unavailable. */
  payoutRatio: number | null;
  safety: DividendSafety;
}

/**
 * Dividend payout = |dividends_paid| / net_profit, only when net_profit > 0.
 * Yahoo reports dividends paid as a negative cash outflow, so the magnitude is
 * used. Safety: <=60% strong, <=90% moderate, otherwise weak; "not_available"
 * when either input is missing or net profit is not positive.
 */
export function computeDividend(
  dividendsPaid: number | null,
  netProfit: number | null,
): DividendResult {
  if (!isNum(dividendsPaid) || !isNum(netProfit) || netProfit <= 0) {
    return { payoutRatio: null, safety: "not_available" };
  }
  const payoutRatio = Math.abs(dividendsPaid) / netProfit;
  const safety: DividendSafety =
    payoutRatio <= 0.6 ? "strong" : payoutRatio <= 0.9 ? "moderate" : "weak";
  return { payoutRatio: Math.round(payoutRatio * 10000) / 10000, safety };
}

// ---------------------------------------------------------------------------
// Pillar integration helpers
// ---------------------------------------------------------------------------

/** Map an Altman zone to financial-health pillar points. */
export function altmanZonePoints(zone: AltmanZone | null): number | null {
  if (zone === "safe") return 100;
  if (zone === "grey") return 50;
  if (zone === "distress") return 10;
  return null; // not_applicable / unknown
}
