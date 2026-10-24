/**
 * Portfolio volatility from the covariance matrix of daily returns.
 * Requires >= 60 overlapping days across the weighted holdings, else null.
 */

const MIN_OVERLAP_DAYS = 60;
const TRADING_DAYS = 252;

export interface VolatilityResult {
  /** Annualised portfolio volatility (fraction), or null. */
  volatility: number | null;
  reason: "ok" | "insufficient_history" | "no_weights";
  overlapDays: number;
}

/**
 * @param weights       symbol -> weight (fraction, over priced holdings)
 * @param returnsBySym  symbol -> date -> daily return
 */
export function computePortfolioVolatility(
  weights: Map<string, number>,
  returnsBySym: Map<string, Map<string, number>>,
): VolatilityResult {
  const symbols = [...weights.keys()].filter(
    (s) => (weights.get(s) ?? 0) > 0 && returnsBySym.has(s),
  );
  if (symbols.length === 0) {
    return { volatility: null, reason: "no_weights", overlapDays: 0 };
  }

  // Common dates across all included symbols.
  let commonDates: string[] | null = null;
  for (const s of symbols) {
    const dates = new Set(returnsBySym.get(s)!.keys());
    commonDates =
      commonDates == null
        ? [...dates]
        : commonDates.filter((d) => dates.has(d));
  }
  const dates = (commonDates ?? []).sort();
  if (dates.length < MIN_OVERLAP_DAYS) {
    return {
      volatility: null,
      reason: "insufficient_history",
      overlapDays: dates.length,
    };
  }

  // Build aligned return series per symbol.
  const series = new Map<string, number[]>();
  for (const s of symbols) {
    const r = returnsBySym.get(s)!;
    series.set(s, dates.map((d) => r.get(d) as number));
  }

  // Covariance matrix (sample).
  const means = new Map<string, number>();
  for (const s of symbols) {
    const arr = series.get(s)!;
    means.set(s, arr.reduce((a, b) => a + b, 0) / arr.length);
  }

  const n = dates.length;
  const cov = (a: string, b: string): number => {
    const sa = series.get(a)!;
    const sb = series.get(b)!;
    const ma = means.get(a)!;
    const mb = means.get(b)!;
    let acc = 0;
    for (let i = 0; i < n; i++) acc += (sa[i] - ma) * (sb[i] - mb);
    return acc / (n - 1);
  };

  // Portfolio variance = Σ_i Σ_j w_i w_j cov(i,j). Renormalise weights over the
  // included symbols so they sum to 1.
  const totalW = symbols.reduce((s, sym) => s + (weights.get(sym) ?? 0), 0);
  if (totalW === 0) {
    return { volatility: null, reason: "no_weights", overlapDays: n };
  }
  const w = (sym: string) => (weights.get(sym) ?? 0) / totalW;

  let variance = 0;
  for (const i of symbols) {
    for (const j of symbols) {
      variance += w(i) * w(j) * cov(i, j);
    }
  }
  if (variance < 0) variance = 0;

  const dailyVol = Math.sqrt(variance);
  const annualised = dailyVol * Math.sqrt(TRADING_DAYS);

  return { volatility: annualised, reason: "ok", overlapDays: n };
}

export { MIN_OVERLAP_DAYS };
