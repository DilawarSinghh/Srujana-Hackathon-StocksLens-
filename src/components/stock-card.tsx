import Link from "next/link";
import { AlertTriangle, TrendingDown, TrendingUp } from "lucide-react";
import type { StockListItem } from "@/lib/data/stocks";
import { LABELS } from "@/lib/scoring/constants";
import { formatPrice, dayChangePercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScoreBadge } from "@/components/score-badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface StockCardProps {
  stock: StockListItem;
}

/** Ranked stock card for the home listing. */
export function StockCard({ stock }: StockCardProps) {
  const change = dayChangePercent(stock.price, stock.prev_close);
  const limited = stock.label === LABELS.limited;

  return (
    <Card className="transition-colors hover:border-primary/40">
      <CardContent className="p-4">
        <Link
          href={`/stocks/${encodeURIComponent(stock.symbol)}`}
          className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-semibold">{stock.name}</p>
              <p className="text-xs text-muted-foreground">
                {stock.symbol}
                {stock.sector ? ` · ${stock.sector}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {stock.capped ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className="text-weak"
                      aria-label="Score capped due to red flags"
                    >
                      <AlertTriangle className="h-4 w-4" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    Score capped due to red flags
                  </TooltipContent>
                </Tooltip>
              ) : null}
              <ScoreBadge score={stock.total_score} label={stock.label} size="sm" />
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm font-medium tabular-nums">
              {formatPrice(stock.price)}
            </span>
            <span className="flex items-center gap-2">
              {limited ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="text-[10px]">
                      Limited data
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    Some data is incomplete, so this score is less reliable.
                  </TooltipContent>
                </Tooltip>
              ) : null}
              {change == null ? (
                <span className="text-xs text-muted-foreground">—</span>
              ) : (
                <span
                  className={cn(
                    "flex items-center gap-0.5 text-xs font-medium tabular-nums",
                    change >= 0 ? "text-strong" : "text-weak",
                  )}
                >
                  {change >= 0 ? (
                    <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {change >= 0 ? "+" : ""}
                  {change.toFixed(2)}%
                </span>
              )}
            </span>
          </div>
        </Link>
      </CardContent>
    </Card>
  );
}
