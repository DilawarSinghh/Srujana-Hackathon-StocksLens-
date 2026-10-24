import type { Direction } from "./constants";

/** Format a metric value for a sentence given its unit. */
export function formatMetricValue(
  value: number,
  unit: "percent" | "x" | "ratio",
): string {
  if (unit === "percent") return `${(value * 100).toFixed(1)}%`;
  if (unit === "x") return `${value.toFixed(2)}x`;
  return value.toFixed(2);
}

/**
 * Describe where a percentile sits, in plain English. No LLM.
 * For "high is better" a high percentile is good; for "low is better" the
 * percentile is already flipped, so a high percentile is still good.
 */
export function describePercentile(
  label: string,
  rawValue: number,
  unit: "percent" | "x" | "ratio",
  percentile: number,
  direction: Direction,
): string {
  const v = formatMetricValue(rawValue, unit);
  const topPct = Math.round(100 - percentile);

  let standing: string;
  if (percentile >= 80) standing = `in the top ${Math.max(1, topPct)}% of its sector`;
  else if (percentile >= 60) standing = "above the sector average";
  else if (percentile >= 40) standing = "around the sector average";
  else if (percentile >= 20) standing = "below the sector average";
  else standing = `in the bottom ${Math.max(1, Math.round(percentile))}% of its sector`;

  const betterNote =
    direction === "low" ? " (lower is better here)" : "";

  return `${label} of ${v} is ${standing}${betterNote}.`;
}

/** Sentence when a metric is unavailable. */
export function describeMissing(label: string): string {
  return `${label}: not available.`;
}
