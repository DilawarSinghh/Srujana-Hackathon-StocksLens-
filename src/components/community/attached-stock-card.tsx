import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { StockCardSnapshot } from "@/types/database";
import { formatPrice, formatMultiple, formatPercentFromFraction } from "@/lib/format";
import { ScoreBadge } from "@/components/score-badge";

/**
 * A StockLens stock card attached to a post. Shows ONLY the snapshot captured
 * at posting time, and labels it as such — so historical posts never silently
 * display today's values as the values at posting time. Null metrics render
 * "Not available" (never 0). The score/label come from the scoring engine; we
 * do not compute anything here.
 */
export function AttachedStockCard({
  symbol,
  snapshot,
}: {
  symbol: string;
  snapshot: StockCardSnapshot | null;
}) {
  if (!snapshot) {
    return (
      <Link
        href={`/stocks/${encodeURIComponent(symbol)}`}
        className="flex items-center justify-between rounded-lg border border-border bg-surface/40 px-3 py-2 text-sm hover:border-primary/40"
      >
        <span className="font-medium">${symbol}</span>
        <ArrowUpRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </Link>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{snapshot.name ?? symbol}</p>
          <p className="text-xs text-muted-foreground">
            {snapshot.symbol}
            {snapshot.exchange ? ` · ${snapshot.exchange}` : ""}
            {snapshot.sector ? ` · ${snapshot.sector}` : ""}
          </p>
        </div>
        <ScoreBadge score={snapshot.total_score} label={snapshot.label} size="sm" />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
        <Metric label="Price" value={formatPrice(snapshot.price)} />
        <Metric label="P/E" value={formatMultiple(snapshot.pe)} />
        <Metric label="P/B" value={formatMultiple(snapshot.pb)} />
        <Metric label="ROE" value={formatPercentFromFraction(snapshot.roe)} />
        <Metric label="Op. margin" value={formatPercentFromFraction(snapshot.operating_margin)} />
        <Metric label="Rev CAGR 3y" value={formatPercentFromFraction(snapshot.revenue_cagr_3y)} />
      </dl>

      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          Snapshot at posting time
          {snapshot.as_of ? ` · data as of ${snapshot.as_of}` : ""} · delayed prices
        </span>
        <Link
          href={`/stocks/${encodeURIComponent(symbol)}`}
          className="inline-flex items-center gap-0.5 text-primary hover:underline"
        >
          Full detail <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
