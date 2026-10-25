import type { DailyBar, AnnualFundamental } from "./yahoo";

/**
 * Pure parsers for Yahoo's crumb-free direct-HTTP endpoints. Kept separate from
 * the network code so they are unit-testable against captured response shapes.
 * Any missing/invalid value becomes null — nothing is defaulted or invented.
 */

const n = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

// ---------------------------------------------------------------------------
// v8 chart: /v8/finance/chart/<symbol>
// ---------------------------------------------------------------------------

/** Parse the v8 chart response into chronological daily bars. */
export function parseChartJson(json: unknown): DailyBar[] {
  const result = (
    json as {
      chart?: {
        result?: {
          timestamp?: number[];
          indicators?: {
            quote?: {
              open?: (number | null)[];
              high?: (number | null)[];
              low?: (number | null)[];
              close?: (number | null)[];
              volume?: (number | null)[];
            }[];
            adjclose?: { adjclose?: (number | null)[] }[];
          };
        }[];
      };
    }
  )?.chart?.result?.[0];

  const timestamps = result?.timestamp ?? [];
  const q = result?.indicators?.quote?.[0];
  const adj = result?.indicators?.adjclose?.[0]?.adjclose;
  if (timestamps.length === 0 || !q) return [];

  const bars: DailyBar[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const ts = timestamps[i];
    if (typeof ts !== "number" || !Number.isFinite(ts)) continue;
    bars.push({
      date: new Date(ts * 1000).toISOString().slice(0, 10),
      open: n(q.open?.[i]),
      high: n(q.high?.[i]),
      low: n(q.low?.[i]),
      close: n(q.close?.[i]) ?? n(adj?.[i]),
      volume: n(q.volume?.[i]),
    });
  }
  // Chronological, de-duplicated by date (keep last seen for a date).
  const byDate = new Map<string, DailyBar>();
  for (const b of bars) byDate.set(b.date, b);
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------------------
// fundamentals-timeseries: /ws/fundamentals-timeseries/v1/...
// ---------------------------------------------------------------------------

/**
 * Map each AnnualFundamental field to the Yahoo timeseries metric key(s) that
 * supply it (first non-null wins). Mirrors the library-path field selection.
 */
const FIELD_KEYS: Record<keyof Omit<AnnualFundamental, "fiscalYear">, string[]> = {
  revenue: ["annualTotalRevenue", "annualOperatingRevenue"],
  operatingProfit: ["annualOperatingIncome"],
  netProfit: ["annualNetIncome", "annualNetIncomeCommonStockholders"],
  totalDebt: ["annualTotalDebt"],
  totalEquity: ["annualStockholdersEquity", "annualTotalEquityGrossMinorityInterest"],
  totalAssets: ["annualTotalAssets"],
  currentLiabilities: ["annualCurrentLiabilities"],
  operatingCashFlow: ["annualOperatingCashFlow"],
  interestExpense: ["annualInterestExpense"],
  ebit: ["annualEBIT", "annualOperatingIncome"],
  dividendsPaid: ["annualCashDividendsPaid"],
  sharesOutstanding: ["annualBasicAverageShares", "annualOrdinarySharesNumber"],
  currentAssets: ["annualCurrentAssets"],
  grossProfit: ["annualGrossProfit"],
  costOfRevenue: ["annualCostOfRevenue", "annualReconciledCostOfRevenue"],
  retainedEarnings: ["annualRetainedEarnings"],
  longTermDebt: ["annualLongTermDebt", "annualLongTermDebtAndCapitalLeaseObligation"],
  totalLiabilities: ["annualTotalLiabilitiesNetMinorityInterest", "annualTotalLiabilities"],
};

/** Every distinct Yahoo metric key we request from the timeseries endpoint. */
export const FUNDAMENTALS_TIMESERIES_KEYS: string[] = [
  ...new Set(Object.values(FIELD_KEYS).flat()),
];

interface TimeseriesEntry {
  asOfDate?: string;
  reportedValue?: { raw?: number };
}
interface TimeseriesResultItem {
  meta?: { type?: string[] };
  [metricKey: string]: unknown;
}

/**
 * Parse the fundamentals-timeseries response. The response is an array of
 * per-metric series; we pivot them into one AnnualFundamental per fiscal year
 * (keyed by `asOfDate`'s year).
 */
export function parseFundamentalsTimeseriesJson(
  json: unknown,
): AnnualFundamental[] {
  const items =
    (json as { timeseries?: { result?: TimeseriesResultItem[] } })?.timeseries
      ?.result ?? [];

  // byYear[year][metricKey] = raw number
  const byYear = new Map<number, Record<string, number>>();

  for (const item of items) {
    const metricKey = item?.meta?.type?.[0];
    if (!metricKey) continue;
    const series = item[metricKey];
    if (!Array.isArray(series)) continue;
    for (const entry of series as TimeseriesEntry[]) {
      const raw = entry?.reportedValue?.raw;
      const asOf = entry?.asOfDate;
      if (typeof raw !== "number" || !Number.isFinite(raw) || !asOf) continue;
      const year = new Date(asOf).getFullYear();
      if (!Number.isFinite(year)) continue;
      const bucket = byYear.get(year) ?? {};
      bucket[metricKey] = raw;
      byYear.set(year, bucket);
    }
  }

  const pick = (bucket: Record<string, number>, keys: string[]): number | null => {
    for (const k of keys) {
      const v = bucket[k];
      if (typeof v === "number" && Number.isFinite(v)) return v;
    }
    return null;
  };

  return [...byYear.entries()]
    .map(([fiscalYear, bucket]) => {
      const out = { fiscalYear } as AnnualFundamental;
      for (const field of Object.keys(FIELD_KEYS) as (keyof typeof FIELD_KEYS)[]) {
        out[field] = pick(bucket, FIELD_KEYS[field]);
      }
      return out;
    })
    .sort((a, b) => a.fiscalYear - b.fiscalYear);
}
