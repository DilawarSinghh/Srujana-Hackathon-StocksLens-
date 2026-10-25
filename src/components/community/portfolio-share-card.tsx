import Link from "next/link";
import { Wallet, AlertCircle } from "lucide-react";
import type { PortfolioSharePreview } from "@/lib/community/queries";
import { absoluteTime } from "@/lib/community/format";
import { cn } from "@/lib/utils";

/**
 * Inline portfolio-share snapshot embedded in a post card. Shows ONLY the
 * fields the author disclosed. Values are the immutable snapshot captured at
 * publish time — never live portfolio data — and are labelled as such. Missing
 * or revoked snapshots degrade to a clear state instead of crashing the feed.
 */
export function PortfolioShareCard({
  share,
  shareId,
}: {
  share: PortfolioSharePreview | null;
  shareId: string;
}) {
  // Snapshot unavailable (revoked, private to someone else, or not returned by
  // RLS). Degrade gracefully with a link rather than crashing the feed.
  if (!share || share.revoked) {
    return (
      <div className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-surface/40 px-3 py-2 text-sm text-muted-foreground">
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
        {share?.revoked
          ? "This portfolio share was revoked by its author."
          : "This portfolio snapshot is no longer available."}
      </div>
    );
  }

  const holdings = share.showHoldings ? share.holdings : [];
  const hasAllocationBars =
    share.showAllocations && holdings.some((h) => h.allocationPct != null);
  const risk = share.showRiskMetrics ? share.riskSnapshot : null;

  return (
    <section
      className="mt-2 rounded-lg border border-border bg-surface/40 p-3"
      aria-label="Shared portfolio snapshot"
    >
      <div className="flex items-center gap-2">
        <Wallet className="h-4 w-4 text-primary" aria-hidden="true" />
        <Link
          href={`/community/portfolio/${shareId}`}
          className="truncate text-sm font-semibold hover:underline"
        >
          {share.title}
        </Link>
        {share.isHypothetical ? (
          <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            Hypothetical
          </span>
        ) : null}
        <span
          className="ml-auto shrink-0 text-[11px] text-muted-foreground"
          title={absoluteTime(share.createdAt)}
        >
          Snapshot
        </span>
      </div>

      {/* Holdings + allocation. */}
      {holdings.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1.5">
          {holdings.slice(0, 8).map((h) => (
            <li key={h.symbol} className="text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">
                  <span className="font-medium">${h.symbol}</span>
                  {share.showSectors && h.sector ? (
                    <span className="text-muted-foreground"> · {h.sector}</span>
                  ) : null}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {h.allocationPct != null ? `${h.allocationPct.toFixed(1)}%` : null}
                  {h.quantity != null ? ` · ${h.quantity} sh` : ""}
                  {h.investedAmount != null
                    ? ` · ₹${Math.round(h.investedAmount).toLocaleString("en-IN")}`
                    : ""}
                </span>
              </div>
              {hasAllocationBars && h.allocationPct != null ? (
                <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary/70"
                    style={{ width: `${Math.min(100, Math.max(0, h.allocationPct))}%` }}
                  />
                </div>
              ) : null}
            </li>
          ))}
          {holdings.length > 8 ? (
            <li className="text-[11px] text-muted-foreground">
              +{holdings.length - 8} more —{" "}
              <Link href={`/community/portfolio/${shareId}`} className="text-primary hover:underline">
                view all
              </Link>
            </li>
          ) : null}
        </ul>
      ) : null}

      {/* Risk metrics (deterministic snapshot). */}
      {risk ? (
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] sm:grid-cols-3">
          <Metric label="Beta" value={risk.beta != null ? risk.beta.toFixed(2) : "Not available"} />
          <Metric
            label="Volatility"
            value={risk.volatility != null ? `${(risk.volatility * 100).toFixed(1)}%` : "Not available"}
          />
          <Metric
            label="Top sector"
            value={
              risk.topSector
                ? `${risk.topSector}${risk.topSectorWeight != null ? ` ${(risk.topSectorWeight * 100).toFixed(0)}%` : ""}`
                : "Not available"
            }
          />
        </dl>
      ) : null}

      {!share.showHoldings && !risk ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Summary only — the author chose not to disclose holdings or metrics.
        </p>
      ) : null}

      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[10px] text-muted-foreground">
          Point-in-time snapshot · delayed prices · not live portfolio values
        </p>
        <Link
          href={`/community/portfolio/${shareId}`}
          className="shrink-0 text-xs font-medium text-primary hover:underline"
        >
          Review →
        </Link>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn("flex flex-col")}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium nums">{value}</dd>
    </div>
  );
}
