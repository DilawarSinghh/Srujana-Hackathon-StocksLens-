import type { StockListItem } from "@/lib/data/stocks";
import { LABELS } from "@/lib/scoring/constants";

/**
 * Deterministic data-coverage classification for a stock listing row.
 *
 * Turns the generic "Limited data" experience into an informative reason, using
 * ONLY the fields already loaded for the card (no extra queries, no fabricated
 * data). A score, data coverage, and data freshness are kept as SEPARATE
 * concepts — a null score never means "zero", it means "not scored yet / not
 * enough data".
 */

export type CoverageStatus =
  | "scored" // has a usable score (label not "Limited data")
  | "limited" // scored but flagged limited-data (score shown, less reliable)
  | "no_fundamentals" // price exists but no score yet (fundamentals not ingested/insufficient)
  | "no_price" // not even a current price yet (just discovered / fetch pending)
  | "stale"; // data older than the freshness window

export interface Coverage {
  status: CoverageStatus;
  /** Short, user-facing explanation of the state. */
  reason: string;
  /** True when a numeric score may be shown for this row. */
  showScore: boolean;
}

/** Days after which the latest metric timestamp is considered stale. */
export const STALE_AFTER_DAYS = 7;

function isStale(asOf: string | null, now: Date): boolean {
  if (!asOf) return false;
  const t = Date.parse(asOf);
  if (!Number.isFinite(t)) return false;
  const ageDays = (now.getTime() - t) / 86_400_000;
  return ageDays > STALE_AFTER_DAYS;
}

/**
 * Classify why a stock does (or does not) have a reliable score. `now` is
 * injectable for deterministic tests.
 */
export function classifyCoverage(item: StockListItem, now: Date = new Date()): Coverage {
  const hasScore = item.total_score != null;
  const limited = item.label === LABELS.limited;
  const stale = isStale(item.as_of, now);

  // A genuinely scored stock, but its data is old.
  if (hasScore && stale) {
    return {
      status: "stale",
      reason: `Data may be out of date (last updated ${formatAsOf(item.as_of)}).`,
      showScore: true,
    };
  }

  if (hasScore && !limited) {
    return { status: "scored", reason: "Scored from available data.", showScore: true };
  }

  if (hasScore && limited) {
    return {
      status: "limited",
      reason:
        "Some required inputs are missing, so this score is based on partial data and is less reliable.",
      showScore: true,
    };
  }

  // No score at all — distinguish "no price yet" from "no fundamentals yet".
  if (item.price == null) {
    return {
      status: "no_price",
      reason:
        "Market data hasn't been fetched for this stock yet, so there's no price or score.",
      showScore: false,
    };
  }

  return {
    status: "no_fundamentals",
    reason:
      "Fundamental data isn't available yet (not ingested or insufficient history), so no score has been computed.",
    showScore: false,
  };
}

function formatAsOf(asOf: string | null): string {
  if (!asOf) return "unknown";
  const t = Date.parse(asOf);
  if (!Number.isFinite(t)) return asOf;
  return new Date(t).toLocaleDateString();
}
