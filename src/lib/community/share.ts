import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ShareRiskSnapshot } from "@/types/database";

export interface ShareHoldingView {
  symbol: string;
  name: string | null;
  sector: string | null;
  allocationPct: number | null;
  quantity: number | null;
  investedAmount: number | null;
}

export interface ShareReviewView {
  id: string;
  reviewerId: string;
  reviewerName: string;
  diversification: number | null;
  concentration: number | null;
  sectorBalance: number | null;
  riskAlignment: number | null;
  comment: string | null;
  createdAt: string;
}

export interface ShareView {
  id: string;
  ownerId: string;
  ownerName: string;
  title: string;
  notes: string | null;
  isHypothetical: boolean;
  visibility: string;
  revoked: boolean;
  isOwner: boolean;
  showHoldings: boolean;
  showAllocations: boolean;
  showQuantities: boolean;
  showAmounts: boolean;
  showSectors: boolean;
  showRiskMetrics: boolean;
  objective: string | null;
  horizon: string | null;
  riskTolerance: string | null;
  feedbackWanted: string | null;
  riskSnapshot: ShareRiskSnapshot | null;
  createdAt: string;
  holdings: ShareHoldingView[];
  reviews: ShareReviewView[];
  viewerHasReviewed: boolean;
}

/**
 * Load a share for viewing. RLS already enforces that the row is only returned
 * when it's public/unlisted (and not revoked) or owned by the viewer, so this
 * never leaks a private share. We additionally project only the disclosed
 * fields into the view so a client can never see hidden values.
 */
export async function getShare(
  shareId: string,
  viewerId: string | null,
): Promise<ShareView | null> {
  const supabase = await createClient();
  const { data: share } = await supabase
    .from("community_portfolio_shares")
    .select("*")
    .eq("id", shareId)
    .maybeSingle();
  if (!share) return null;

  const isOwner = viewerId === share.owner_id;

  // Owner name.
  const { data: ownerProfile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", share.owner_id)
    .maybeSingle();

  // Holdings — only loaded when disclosed. Each field is projected per flag.
  let holdings: ShareHoldingView[] = [];
  if (share.show_holdings) {
    const { data: rows } = await supabase
      .from("community_portfolio_share_holdings")
      .select("symbol, name, sector, allocation_pct, quantity, invested_amount, position")
      .eq("share_id", shareId)
      .order("position", { ascending: true });
    holdings = (rows ?? []).map((h) => ({
      symbol: h.symbol,
      name: h.name,
      sector: share.show_sectors ? h.sector : null,
      allocationPct: share.show_allocations ? h.allocation_pct : null,
      quantity: share.show_quantities ? h.quantity : null,
      investedAmount: share.show_amounts ? h.invested_amount : null,
    }));
  }

  // Reviews.
  const { data: reviewRows } = await supabase
    .from("community_portfolio_reviews")
    .select("id, reviewer_id, diversification_rating, concentration_rating, sector_balance_rating, risk_alignment_rating, comment, created_at")
    .eq("share_id", shareId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  const reviewerIds = [...new Set((reviewRows ?? []).map((r) => r.reviewer_id))];
  const names = new Map<string, string>();
  if (reviewerIds.length) {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", reviewerIds);
    for (const p of profiles ?? []) names.set(p.id, p.full_name ?? "Investor");
  }
  const reviews: ShareReviewView[] = (reviewRows ?? []).map((r) => ({
    id: r.id,
    reviewerId: r.reviewer_id,
    reviewerName: names.get(r.reviewer_id) ?? "Investor",
    diversification: r.diversification_rating,
    concentration: r.concentration_rating,
    sectorBalance: r.sector_balance_rating,
    riskAlignment: r.risk_alignment_rating,
    comment: r.comment,
    createdAt: r.created_at,
  }));

  return {
    id: share.id,
    ownerId: share.owner_id,
    ownerName: ownerProfile?.full_name ?? "Investor",
    title: share.title,
    notes: share.notes,
    isHypothetical: share.is_hypothetical,
    visibility: share.visibility,
    revoked: !!share.revoked_at,
    isOwner,
    showHoldings: share.show_holdings,
    showAllocations: share.show_allocations,
    showQuantities: share.show_quantities,
    showAmounts: share.show_amounts,
    showSectors: share.show_sectors,
    showRiskMetrics: share.show_risk_metrics,
    objective: share.objective,
    horizon: share.horizon,
    riskTolerance: share.risk_tolerance,
    feedbackWanted: share.feedback_wanted,
    riskSnapshot: share.show_risk_metrics ? (share.risk_snapshot as ShareRiskSnapshot | null) : null,
    createdAt: share.created_at,
    holdings,
    reviews,
    viewerHasReviewed: viewerId ? reviews.some((r) => r.reviewerId === viewerId) : false,
  };
}
