import type { AuditorOpinion, RelatedPartyTrend } from "@/types/database";

export interface GovernanceInput {
  promoter_pledge_pct: number | null;
  promoter_holding_change_1y: number | null;
  auditor_opinion: AuditorOpinion;
  related_party_trend: RelatedPartyTrend;
}

/**
 * Governance pillar score (0-100) = average of the AVAILABLE sub-scores.
 * 'unknown' auditor/related-party and null numeric inputs are SKIPPED.
 * Returns null if no sub-score is available.
 */
export function scoreGovernance(g: GovernanceInput | null): number | null {
  if (!g) return null;
  const parts: number[] = [];

  // Pledge: 0% = 100, ≤10% = 80, ≤30% = 40, >30% = 0.
  if (g.promoter_pledge_pct != null) {
    const p = g.promoter_pledge_pct;
    if (p === 0) parts.push(100);
    else if (p <= 10) parts.push(80);
    else if (p <= 30) parts.push(40);
    else parts.push(0);
  }

  // Auditor: unqualified = 100; qualified/adverse/disclaimer = 0; unknown skipped.
  if (g.auditor_opinion && g.auditor_opinion !== "unknown") {
    parts.push(g.auditor_opinion === "unqualified" ? 100 : 0);
  }

  // Related party: stable = 100, rising = 50, sharply_rising = 0; unknown skipped.
  if (g.related_party_trend && g.related_party_trend !== "unknown") {
    if (g.related_party_trend === "stable") parts.push(100);
    else if (g.related_party_trend === "rising") parts.push(50);
    else if (g.related_party_trend === "sharply_rising") parts.push(0);
  }

  // Promoter holding change: worse than -5 points = 30, else 100.
  if (g.promoter_holding_change_1y != null) {
    parts.push(g.promoter_holding_change_1y < -5 ? 30 : 100);
  }

  if (parts.length === 0) return null;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}
