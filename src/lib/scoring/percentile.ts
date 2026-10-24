import type { Direction } from "./constants";

/**
 * Percentile rank of `value` within `peers` (both already filtered to non-null),
 * scaled 0-100. For "low is better" metrics the result is flipped so that a
 * lower raw value yields a higher score.
 *
 * Uses the "below + half-equal" method:
 *   pct = (countBelow + 0.5 * countEqual) / n
 * which maps the median to ~50 and avoids 0/100 extremes for ties.
 */
export function percentileRank(
  value: number,
  peers: number[],
  direction: Direction,
): number | null {
  const vals = peers.filter((v) => Number.isFinite(v));
  const n = vals.length;
  if (n === 0) return null;
  if (!Number.isFinite(value)) return null;

  let below = 0;
  let equal = 0;
  for (const v of vals) {
    if (v < value) below++;
    else if (v === value) equal++;
  }

  let pct = ((below + 0.5 * equal) / n) * 100;
  if (direction === "low") pct = 100 - pct;

  // Clamp to [0, 100] for safety.
  return Math.max(0, Math.min(100, pct));
}
