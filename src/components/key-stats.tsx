import type { Tables } from "@/types/database";
import {
  formatCrore,
  formatMultiple,
  formatPercent,
  formatPercentFromFraction,
  formatPrice,
  NOT_AVAILABLE,
} from "@/lib/format";

interface KeyStatsProps {
  metrics: Tables<"stock_metrics"> | null;
}

/** Grid of key ratios. Nulls render "Not available". */
export function KeyStats({ metrics }: KeyStatsProps) {
  const stats: { label: string; value: string }[] = [
    { label: "Market cap", value: formatCrore(metrics?.market_cap) },
    { label: "P/E", value: formatMultiple(metrics?.pe) },
    { label: "P/B", value: formatMultiple(metrics?.pb) },
    { label: "ROE", value: formatPercentFromFraction(metrics?.roe) },
    { label: "ROCE", value: formatPercentFromFraction(metrics?.roce) },
    { label: "Debt / Equity", value: formatMultiple(metrics?.debt_to_equity) },
    { label: "Dividend yield", value: formatPercent(metrics?.dividend_yield) },
    {
      label: "52-week range",
      value:
        metrics?.week52_low != null && metrics?.week52_high != null
          ? `${formatPrice(metrics.week52_low)} – ${formatPrice(metrics.week52_high)}`
          : NOT_AVAILABLE,
    },
    { label: "Beta", value: formatMultiple(metrics?.beta) },
  ];

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
      {stats.map((s) => (
        <div key={s.label} className="flex flex-col">
          <dt className="text-xs text-muted-foreground">{s.label}</dt>
          <dd className="text-sm font-medium tabular-nums">{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}
