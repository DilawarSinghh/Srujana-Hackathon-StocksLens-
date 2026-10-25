/**
 * Market-cap classification (internally-calculated APPROXIMATION).
 *
 * The product does not have a licensed feed of the official AMFI/SEBI market-
 * cap category list, so we classify by RANKING the eligible universe (every
 * active stock that has a sourced market capitalisation) in descending market
 * cap and applying documented rank bands:
 *
 *   rank 1–100     → large
 *   rank 101–250   → mid
 *   rank 251+      → small
 *
 * This mirrors the SEBI/AMFI rank-band methodology (top 100 = large, next 150 =
 * mid, rest = small) but is computed over the SUPPORTED universe, not the full
 * ~5000 listed companies — so it is an approximation and MUST be labelled as
 * such in the UI (never presented as the official classification).
 *
 * A stock with NO market cap is classified `null` (unavailable) — never
 * guessed. Pure + deterministic so it is unit-testable without a provider/DB.
 */

export type CapCategory = "large" | "mid" | "small";

/** Rank-band thresholds. Documented single source of truth. */
export const LARGE_CAP_MAX_RANK = 100;
export const MID_CAP_MAX_RANK = 250;

export interface CapInput {
  stockId: string;
  /** Market capitalisation in INR crore (null when the provider had none). */
  marketCapCrore: number | null;
}

export interface CapResult {
  stockId: string;
  /** null = not classifiable (no sourced market cap for this stock). */
  cap: CapCategory | null;
  /** 1-based rank within the eligible (has-market-cap) universe, else null. */
  rank: number | null;
}

/** Map a 1-based rank to a cap band. */
export function rankToCap(rank: number): CapCategory {
  if (rank <= LARGE_CAP_MAX_RANK) return "large";
  if (rank <= MID_CAP_MAX_RANK) return "mid";
  return "small";
}

/**
 * Classify a universe by descending market cap. Stocks without a market cap are
 * returned with cap=null, rank=null (excluded from ranking — their absence
 * never shifts anyone else's rank). Ties break by stockId for determinism.
 */
export function classifyUniverse(input: CapInput[]): CapResult[] {
  const eligible = input.filter(
    (s): s is CapInput & { marketCapCrore: number } =>
      typeof s.marketCapCrore === "number" && Number.isFinite(s.marketCapCrore) && s.marketCapCrore > 0,
  );
  const ineligible = input.filter(
    (s) => !(typeof s.marketCapCrore === "number" && Number.isFinite(s.marketCapCrore) && s.marketCapCrore > 0),
  );

  const ranked = [...eligible].sort((a, b) => {
    if (b.marketCapCrore !== a.marketCapCrore) return b.marketCapCrore - a.marketCapCrore;
    return a.stockId.localeCompare(b.stockId);
  });

  const results: CapResult[] = ranked.map((s, i) => {
    const rank = i + 1;
    return { stockId: s.stockId, cap: rankToCap(rank), rank };
  });

  for (const s of ineligible) {
    results.push({ stockId: s.stockId, cap: null, rank: null });
  }

  return results;
}
