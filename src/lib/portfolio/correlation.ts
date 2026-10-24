/**
 * Pairwise correlation of holdings' daily returns, and each holding's
 * contribution to total portfolio volatility. Pure math — no I/O, no LLM.
 *
 * Correlation uses Pearson's r over the dates common to each PAIR, requiring at
 * least MIN_OVERLAP_DAYS overlapping days for that pair (else null = insufficient
 * history). Volatility contribution uses the covariance matrix over dates common
 * to ALL included holdings.
 */

export const MIN_PAIR_OVERLAP_DAYS = 60;
const TRADING_DAYS = 252;

export interface CorrelationCell {
  a: string;
  b: string;
  /** Pearson r in [-1, 1], or null if insufficient overlapping history. */
  value: number | null;
  overlapDays: number;
}

export interface CorrelationResult {
  symbols: string[];
  /** Square matrix aligned with `symbols`; diagonal = 1, null = insufficient. */
  matrix: (number | null)[][];
  /** Flat list of unique off-diagonal pairs (a < b by index). */
  pairs: CorrelationCell[];
  /** Average of available off-diagonal correlations, or null. */
  averageCorrelation: number | null;
}

function pearson(a: number[], b: number[]): number | null {
  const n = a.length;
  if (n < 2) return null;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma;
    const db = b[i] - mb;
    cov += da * db;
    va += da * da;
    vb += db * db;
  }
  if (va === 0 || vb === 0) return null; // a flat series has no correlation
  return cov / Math.sqrt(va * vb);
}

/** Aligned return pair over the dates common to two symbols. */
function alignPair(
  ra: Map<string, number>,
  rb: Map<string, number>,
): { a: number[]; b: number[]; dates: string[] } {
  const dates = [...ra.keys()].filter((d) => rb.has(d)).sort();
  return {
    a: dates.map((d) => ra.get(d) as number),
    b: dates.map((d) => rb.get(d) as number),
    dates,
  };
}

/**
 * Correlation matrix across the given symbols.
 * @param symbols      symbols to include (order preserved in the matrix)
 * @param returnsBySym symbol -> date -> daily return
 */
export function computeCorrelationMatrix(
  symbols: string[],
  returnsBySym: Map<string, Map<string, number>>,
): CorrelationResult {
  const n = symbols.length;
  const matrix: (number | null)[][] = Array.from({ length: n }, () =>
    Array<number | null>(n).fill(null),
  );
  const pairs: CorrelationCell[] = [];
  const available: number[] = [];

  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const ra = returnsBySym.get(symbols[i]);
      const rb = returnsBySym.get(symbols[j]);
      let value: number | null = null;
      let overlapDays = 0;
      if (ra && rb) {
        const { a, b, dates } = alignPair(ra, rb);
        overlapDays = dates.length;
        if (overlapDays >= MIN_PAIR_OVERLAP_DAYS) {
          value = pearson(a, b);
        }
      }
      matrix[i][j] = value;
      matrix[j][i] = value;
      pairs.push({ a: symbols[i], b: symbols[j], value, overlapDays });
      if (value != null) available.push(value);
    }
  }

  const averageCorrelation =
    available.length > 0
      ? available.reduce((s, v) => s + v, 0) / available.length
      : null;

  return { symbols, matrix, pairs, averageCorrelation };
}

export interface VolContribution {
  symbol: string;
  /** Share of total portfolio variance attributable to this holding (0..1). */
  contribution: number;
}

export interface VolContributionResult {
  contributions: VolContribution[];
  /** Annualised portfolio volatility (fraction) used as the base, or null. */
  portfolioVolatility: number | null;
  overlapDays: number;
}

/**
 * Each holding's contribution to portfolio volatility, using the component
 * c_i = w_i * (Σ_j w_j cov(i,j)) / portfolioVariance, which sums to 1.
 * Uses dates common to ALL included holdings (>= MIN_PAIR_OVERLAP_DAYS).
 */
export function computeVolatilityContributions(
  weights: Map<string, number>,
  returnsBySym: Map<string, Map<string, number>>,
): VolContributionResult {
  const symbols = [...weights.keys()].filter(
    (s) => (weights.get(s) ?? 0) > 0 && returnsBySym.has(s),
  );
  if (symbols.length === 0) {
    return { contributions: [], portfolioVolatility: null, overlapDays: 0 };
  }

  // Dates common to all.
  let common: string[] | null = null;
  for (const s of symbols) {
    const d = new Set(returnsBySym.get(s)!.keys());
    common = common == null ? [...d] : common.filter((x) => d.has(x));
  }
  const dates = (common ?? []).sort();
  if (dates.length < MIN_PAIR_OVERLAP_DAYS) {
    return {
      contributions: [],
      portfolioVolatility: null,
      overlapDays: dates.length,
    };
  }

  const totalW = symbols.reduce((s, sym) => s + (weights.get(sym) ?? 0), 0);
  if (totalW === 0) {
    return { contributions: [], portfolioVolatility: null, overlapDays: dates.length };
  }
  const w = (sym: string) => (weights.get(sym) ?? 0) / totalW;

  const series = new Map<string, number[]>();
  const means = new Map<string, number>();
  for (const s of symbols) {
    const r = returnsBySym.get(s)!;
    const arr = dates.map((d) => r.get(d) as number);
    series.set(s, arr);
    means.set(s, arr.reduce((a, b) => a + b, 0) / arr.length);
  }
  const nn = dates.length;
  const cov = (a: string, b: string): number => {
    const sa = series.get(a)!;
    const sb = series.get(b)!;
    const ma = means.get(a)!;
    const mb = means.get(b)!;
    let acc = 0;
    for (let i = 0; i < nn; i++) acc += (sa[i] - ma) * (sb[i] - mb);
    return acc / (nn - 1);
  };

  let variance = 0;
  const covRow = new Map<string, number>();
  for (const i of symbols) {
    let row = 0;
    for (const j of symbols) row += w(j) * cov(i, j);
    covRow.set(i, row);
    variance += w(i) * row;
  }
  if (variance <= 0) {
    return { contributions: [], portfolioVolatility: 0, overlapDays: nn };
  }

  const contributions: VolContribution[] = symbols.map((s) => ({
    symbol: s,
    contribution: (w(s) * (covRow.get(s) as number)) / variance,
  }));

  return {
    contributions,
    portfolioVolatility: Math.sqrt(variance) * Math.sqrt(TRADING_DAYS),
    overlapDays: nn,
  };
}
