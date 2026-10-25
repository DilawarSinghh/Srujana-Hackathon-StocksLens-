"use client";

import { AlertTriangle } from "lucide-react";
import type { ChatDataBlock } from "@/lib/rag/context";
import type { DebateStock } from "@/components/debate/types";
import { DataFreshness } from "@/components/data-freshness";
import { formatPrice } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface SnapshotBarProps {
  stock: DebateStock;
  snapshot: ChatDataBlock;
  thesis: string;
  focusLabel: string;
}

/** Stock identity, data freshness, score, and missing-data indicators. */
export function SnapshotBar({ stock, snapshot, thesis, focusLabel }: SnapshotBarProps) {
  const score = snapshot.score;
  const price = snapshot.metrics?.price ?? snapshot.price_summary?.latest_close ?? null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">{stock.name}</h2>
            <p className="text-sm text-muted-foreground">
              {stock.symbol}
              {stock.exchange ? ` · ${stock.exchange}` : ""}
              {stock.sector ? ` · ${stock.sector}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {price != null ? (
              <Badge variant="outline" className="font-normal">
                {formatPrice(price)}{" "}
                <span className="ml-1 text-muted-foreground">latest close</span>
              </Badge>
            ) : null}
            {score?.total_score != null ? (
              <Badge variant="secondary" className="font-normal">
                Score {Math.round(score.total_score)}/100
                {score.label ? ` · ${score.label}` : ""}
              </Badge>
            ) : null}
            {score?.capped ? (
              <Badge variant="destructive" className="font-normal">
                Score capped
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <DataFreshness lastUpdated={stock.as_of} />
          <span>Focus: {focusLabel}</span>
          <span className="max-w-full truncate">
            Thesis: {thesis ? `“${thesis}”` : "general investment thesis"}
          </span>
        </div>

        {snapshot.missing.length > 0 ? (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              <strong>Not available for this company:</strong>{" "}
              {snapshot.missing.join(", ")}. The agents treat these as missing,
              never as zero.
            </span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
