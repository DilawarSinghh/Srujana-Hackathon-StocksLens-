/**
 * Pure metric computations. NO external I/O, NO LLM. All code-computed.
 *
 * Rules:
 *  - Never invent or default values. If an input is missing/invalid, return null.
 *  - Money inputs are INR crore; ratios are unitless or percent as noted.
 */

/** Safe division: null if divisor is null/zero or inputs are null. */
function safeDiv(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null || b == null) return null;
  if (b === 0) return null;
  return a / b;
}

function isNum(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

// ---------------------------------------------------------------------------
// Ratios
// ---------------------------------------------------------------------------

/** ROE = net_profit / total_equity. */
export function computeRoe(
  netProfit: number | null,
  totalEquity: number | null,
): number | null {
  return safeDiv(netProfit, totalEquity);
}

/**
 * ROCE = ebit / (total_assets - current_liabilities).
 * Fallback: ebit / (total_equity + total_debt) when the primary denominator
 * is unavailable or non-positive.
 */
export function computeRoce(
  ebit: number | null,
  totalAssets: number | null,
  currentLiabilities: number | null,
  totalEquity: number | null,
  totalDebt: number | null,
): number | null {
  if (!isNum(ebit)) return null;

  if (isNum(totalAssets) && isNum(currentLiabilities)) {
    const capEmployed = totalAssets - currentLiabilities;
    if (capEmployed > 0) return ebit / capEmployed;
  }

  if (isNum(totalEquity) && isNum(totalDebt)) {
    const denom = totalEquity + totalDebt;
    if (denom > 0) return ebit / denom;
  }

  return null;
}

/** Operating margin = operating_profit / revenue. */
export function computeOperatingMargin(
  operatingProfit: number | null,
  revenue: number | null,
): number | null {
  return safeDiv(operatingProfit, revenue);
}

/** Debt/Equity = total_debt / total_equity. */
export function computeDebtToEquity(
  totalDebt: number | null,
  totalEquity: number | null,
): number | null {
  return safeDiv(totalDebt, totalEquity);
}

/** Interest coverage = ebit / interest_expense. */
export function computeInterestCoverage(
  ebit: number | null,
  interestExpense: number | null,
): number | null {
  return safeDiv(ebit, interestExpense);
}

// ---------------------------------------------------------------------------
// CAGR
// ---------------------------------------------------------------------------

/**
 * CAGR over `years` periods given a start and end value.
 * Returns null if either value is missing, the base is zero/negative, the end
 * is non-positive, or years <= 0. (Negative/zero bases make CAGR meaningless.)
 */
export function computeCagr(
  startValue: number | null,
  endValue: number | null,
  years: number,
): number | null {
  if (!isNum(startValue) || !isNum(endValue)) return null;
  if (years <= 0) return null;
  if (startValue <= 0) return null;
  if (endValue <= 0) return null;
  return Math.pow(endValue / startValue, 1 / years) - 1;
}

/**
 * CAGR from an ordered series of annual values (oldest -> newest) over the last
 * `periods` years. Needs at least periods+1 data points. Null on any gap.
 */
export function computeCagrFromSeries(
  valuesOldestToNewest: (number | null)[],
  periods: number,
): number | null {
  if (valuesOldestToNewest.length < periods + 1) return null;
  const end = valuesOldestToNewest[valuesOldestToNewest.length - 1];
  const start = valuesOldestToNewest[valuesOldestToNewest.length - 1 - periods];
  return computeCagr(start, end, periods);
}

/**
 * PEG = pe / (profit_cagr_3y * 100). Only when CAGR > 0.
 * profitCagr3y is a fraction (e.g. 0.15 for 15%).
 */
export function computePeg(
  pe: number | null,
  profitCagr3y: number | null,
): number | null {
  if (!isNum(pe)) return null;
  if (!isNum(profitCagr3y) || profitCagr3y <= 0) return null;
  return pe / (profitCagr3y * 100);
}

// ---------------------------------------------------------------------------
// Price-series metrics
// ---------------------------------------------------------------------------

/** Daily log returns from a close-price series (chronological). */
export function logReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    const cur = closes[i];
    if (prev > 0 && cur > 0) out.push(Math.log(cur / prev));
  }
  return out;
}

/** Sample standard deviation. Null if fewer than 2 values. */
export function stdev(values: number[]): number | null {
  const n = values.length;
  if (n < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (n - 1);
  return Math.sqrt(variance);
}

const TRADING_DAYS = 252;

/**
 * Annualized 1-year volatility = stdev(daily log returns over ~252 days) * sqrt(252).
 * Uses the most recent ~252 closes. Null if insufficient data.
 */
export function computeVolatility1y(closes: number[]): number | null {
  if (closes.length < 2) return null;
  const recent = closes.slice(-(TRADING_DAYS + 1));
  const rets = logReturns(recent);
  const sd = stdev(rets);
  if (sd == null) return null;
  return sd * Math.sqrt(TRADING_DAYS);
}

/**
 * Maximum drawdown over the given close series, as a negative fraction
 * (e.g. -0.35 means a 35% peak-to-trough drop). Null if insufficient data.
 * Pass the last ~3 years of closes for max_drawdown_3y.
 */
export function computeMaxDrawdown(closes: number[]): number | null {
  if (closes.length < 2) return null;
  let peak = closes[0];
  let maxDd = 0;
  for (const c of closes) {
    if (c > peak) peak = c;
    if (peak > 0) {
      const dd = c / peak - 1;
      if (dd < maxDd) maxDd = dd;
    }
  }
  return maxDd;
}

/**
 * Beta of a stock vs a benchmark from ALIGNED daily returns.
 * beta = cov(stock, market) / var(market). Returns null if < 2 aligned points
 * or market variance is zero.
 */
export function computeBeta(
  stockReturns: number[],
  marketReturns: number[],
): number | null {
  const n = Math.min(stockReturns.length, marketReturns.length);
  if (n < 2) return null;
  const s = stockReturns.slice(-n);
  const m = marketReturns.slice(-n);

  const meanS = s.reduce((a, b) => a + b, 0) / n;
  const meanM = m.reduce((a, b) => a + b, 0) / n;

  let cov = 0;
  let varM = 0;
  for (let i = 0; i < n; i++) {
    cov += (s[i] - meanS) * (m[i] - meanM);
    varM += (m[i] - meanM) ** 2;
  }
  cov /= n - 1;
  varM /= n - 1;

  if (varM === 0) return null;
  return cov / varM;
}

/**
 * Align two date->return maps to common dates and return paired arrays in date
 * order. Used to compute beta from daily returns on overlapping trading days.
 */
export function alignReturns(
  stock: Map<string, number>,
  market: Map<string, number>,
): { stock: number[]; market: number[] } {
  const dates = [...stock.keys()].filter((d) => market.has(d)).sort();
  const s: number[] = [];
  const m: number[] = [];
  for (const d of dates) {
    s.push(stock.get(d)!);
    m.push(market.get(d)!);
  }
  return { stock: s, market: m };
}

/** Date-keyed daily log returns from a {date, close} series (chronological). */
export function dailyReturnMap(
  series: { date: string; close: number | null }[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1].close;
    const cur = series[i].close;
    if (isNum(prev) && isNum(cur) && prev > 0 && cur > 0) {
      map.set(series[i].date, Math.log(cur / prev));
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// 52-week stats
// ---------------------------------------------------------------------------

/** 52-week high/low from the most recent ~252 closes. */
export function compute52Week(closes: number[]): {
  high: number | null;
  low: number | null;
} {
  if (closes.length === 0) return { high: null, low: null };
  const recent = closes.slice(-TRADING_DAYS);
  return {
    high: Math.max(...recent),
    low: Math.min(...recent),
  };
}
