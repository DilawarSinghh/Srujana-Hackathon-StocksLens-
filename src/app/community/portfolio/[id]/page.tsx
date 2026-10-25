import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getShare } from "@/lib/community/share";
import { formatPercentFromFraction, formatPrice } from "@/lib/format";
import { relativeTime } from "@/lib/community/format";
import { Badge } from "@/components/ui/badge";
import { ReviewForm } from "@/components/community/review-form";
import { RevokeShareButton } from "@/components/community/revoke-share-button";
import { CommunityNotice } from "@/components/community/community-notice";

export const dynamic = "force-dynamic";

const NA = "Not available";

export default async function SharePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  const share = await getShare(id, user?.id ?? null);
  if (!share) notFound();

  const risk = share.riskSnapshot;

  return (
    <div className="container py-6">
      <div className="mx-auto max-w-2xl">
        <Link href="/community" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to feed
        </Link>

        <div className="mb-4">
          <CommunityNotice />
        </div>

        <div className="rounded-xl border border-border bg-surface/40 p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-xl font-bold">{share.title}</h1>
                {share.isHypothetical ? <Badge variant="outline">Hypothetical</Badge> : null}
                {share.revoked ? <Badge variant="destructive">Revoked</Badge> : null}
              </div>
              <p className="text-sm text-muted-foreground">
                Shared by{" "}
                <Link href={`/community/profile/${share.ownerId}`} className="hover:underline">
                  {share.ownerName}
                </Link>{" "}
                · {relativeTime(share.createdAt)}
              </p>
            </div>
            {share.isOwner ? <RevokeShareButton shareId={share.id} /> : null}
          </div>

          {share.notes ? <p className="mt-3 text-sm">{share.notes}</p> : null}

          {/* Review request context. */}
          {(share.objective || share.horizon || share.riskTolerance || share.feedbackWanted) && (
            <dl className="mt-4 grid grid-cols-1 gap-2 rounded-md border border-border bg-background/50 p-3 text-sm sm:grid-cols-2">
              {share.objective ? <Field label="Objective" value={share.objective} /> : null}
              {share.horizon ? <Field label="Horizon" value={share.horizon} /> : null}
              {share.riskTolerance ? <Field label="Risk tolerance" value={share.riskTolerance} /> : null}
              {share.feedbackWanted ? <Field label="Feedback wanted" value={share.feedbackWanted} /> : null}
            </dl>
          )}

          {/* Holdings (only disclosed fields). */}
          {share.showHoldings && share.holdings.length > 0 ? (
            <div className="mt-4">
              <h2 className="mb-2 text-sm font-semibold">Holdings</h2>
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Stock</th>
                      {share.showSectors ? <th className="px-3 py-2 text-left">Sector</th> : null}
                      {share.showAllocations ? <th className="px-3 py-2 text-right">Alloc %</th> : null}
                      {share.showQuantities ? <th className="px-3 py-2 text-right">Qty</th> : null}
                      {share.showAmounts ? <th className="px-3 py-2 text-right">Invested</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {share.holdings.map((h) => (
                      <tr key={h.symbol} className="border-t border-border">
                        <td className="px-3 py-2">
                          <Link href={`/community/stock/${h.symbol}`} className="font-medium text-primary hover:underline">
                            ${h.symbol}
                          </Link>
                        </td>
                        {share.showSectors ? <td className="px-3 py-2 text-muted-foreground">{h.sector ?? NA}</td> : null}
                        {share.showAllocations ? (
                          <td className="px-3 py-2 text-right tabular-nums">
                            {h.allocationPct != null ? `${h.allocationPct.toFixed(1)}%` : NA}
                          </td>
                        ) : null}
                        {share.showQuantities ? (
                          <td className="px-3 py-2 text-right tabular-nums">{h.quantity ?? NA}</td>
                        ) : null}
                        {share.showAmounts ? (
                          <td className="px-3 py-2 text-right tabular-nums">
                            {h.investedAmount != null ? formatPrice(h.investedAmount) : NA}
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {/* Deterministic risk metrics. */}
          {share.showRiskMetrics && risk ? (
            <div className="mt-4">
              <h2 className="mb-2 text-sm font-semibold">
                StockLens risk metrics <span className="font-normal text-muted-foreground">(calculated, not opinion)</span>
              </h2>
              <dl className="grid grid-cols-2 gap-2 rounded-md border border-border bg-background/50 p-3 text-sm sm:grid-cols-3">
                <Field
                  label="Beta"
                  value={risk.beta != null ? `${risk.beta.toFixed(2)} (covers ${((risk.betaCoveredWeight ?? 0) * 100).toFixed(0)}%)` : NA}
                />
                <Field label="1y volatility" value={risk.volatility != null ? formatPercentFromFraction(risk.volatility) : NA} />
                <Field label="HHI" value={risk.hhi != null ? risk.hhi.toFixed(3) : NA} />
                <Field label="Top sector" value={risk.topSector ?? NA} />
                <Field
                  label="Top sector weight"
                  value={risk.topSectorWeight != null ? formatPercentFromFraction(risk.topSectorWeight) : NA}
                />
              </dl>
              {risk.concentrationFlags.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {risk.concentrationFlags.map((f, i) => (
                    <li key={i} className="rounded-md border border-average/40 bg-average/10 px-2 py-1 text-xs">
                      {f}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Community reviews (subjective). */}
        <div className="mt-5 rounded-xl border border-border bg-surface/40 p-5">
          <h2 className="mb-1 text-sm font-semibold">Community reviews</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Subjective member opinions — not a validated investment score.
          </p>

          {user && !share.isOwner && !share.viewerHasReviewed && !share.revoked ? (
            <div className="mb-4 border-b border-border pb-4">
              <ReviewForm shareId={share.id} />
            </div>
          ) : null}
          {share.viewerHasReviewed ? (
            <p className="mb-3 text-xs text-muted-foreground">You&apos;ve already reviewed this share.</p>
          ) : null}

          {share.reviews.length === 0 ? (
            <p className="text-sm text-muted-foreground">No reviews yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {share.reviews.map((r) => (
                <li key={r.id} className="rounded-md border border-border bg-background/50 p-3">
                  <div className="flex items-center justify-between">
                    <Link href={`/community/profile/${r.reviewerId}`} className="text-sm font-semibold hover:underline">
                      {r.reviewerName}
                    </Link>
                    <span className="text-xs text-muted-foreground">{relativeTime(r.createdAt)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {r.diversification != null ? <span>Diversification {r.diversification}/5</span> : null}
                    {r.concentration != null ? <span>Concentration {r.concentration}/5</span> : null}
                    {r.sectorBalance != null ? <span>Sector balance {r.sectorBalance}/5</span> : null}
                    {r.riskAlignment != null ? <span>Risk alignment {r.riskAlignment}/5</span> : null}
                  </div>
                  {r.comment ? <p className="mt-2 text-sm">{r.comment}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
