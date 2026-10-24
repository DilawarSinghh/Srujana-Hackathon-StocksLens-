"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import type { StressResult } from "@/lib/portfolio/stress";
import { formatPrice, formatSignedRupee } from "@/lib/format";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** Market-drop stress test. Clearly labeled HYPOTHETICAL. Server-computed. */
export function StressTestPanel() {
  const [shock, setShock] = React.useState(-10);
  const [result, setResult] = React.useState<StressResult | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio/stress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketShockPct: shock }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not run the stress test.");
        setResult(null);
      } else {
        setResult(data.result as StressResult);
      }
    } catch {
      setError("Could not run the stress test.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border-2 border-dashed border-average/50 bg-average/5 p-4">
      <div>
        <p className="text-sm font-medium">Market-drop stress test</p>
        <p className="text-xs text-muted-foreground">
          Estimate the hypothetical impact of a broad market fall on your
          portfolio, using each holding&apos;s historical beta.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-sm">
          <span>Market shock</span>
          <span className="font-semibold tabular-nums">{shock}%</span>
        </div>
        <Slider
          value={[shock]}
          min={-40}
          max={-5}
          step={1}
          onValueChange={(v) => setShock(v[0])}
          aria-label="Market shock percent"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>-40%</span>
          <span>-5%</span>
        </div>
      </div>

      <Button onClick={run} disabled={loading} size="sm" className="self-start">
        {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
        Run stress test
      </Button>

      {error ? <p className="text-sm text-weak">{error}</p> : null}

      {result ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-4">
            <Stat label="Estimated loss" value={formatSignedRupee(result.estimatedLoss)} tone="weak" />
            <Stat label="As % of portfolio" value={`${result.estimatedLossPct.toFixed(1)}%`} tone="weak" />
            <Stat label="Portfolio value" value={formatPrice(result.totalValue)} />
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stock</TableHead>
                  <TableHead className="text-right">Beta</TableHead>
                  <TableHead className="text-right">Est. loss</TableHead>
                  <TableHead className="text-right">Est. %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.perHolding.map((h) => (
                  <TableRow key={h.symbol}>
                    <TableCell>{h.symbol}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {h.beta.toFixed(2)}
                      {h.betaAssumed ? <span className="text-muted-foreground">*</span> : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-weak">
                      {formatSignedRupee(h.estimatedLoss)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-weak">
                      {h.estimatedLossPct.toFixed(1)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {result.perHolding.some((h) => h.betaAssumed) ? (
            <p className="text-[11px] text-muted-foreground">
              * Beta unavailable; assumed 1.0 (moves with the market).
            </p>
          ) : null}
        </div>
      ) : null}

      <p className="rounded-md bg-background/60 px-3 py-2 text-[11px] text-muted-foreground">
        Hypothetical estimate based on historical beta. Not a prediction. Actual
        results can differ significantly.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "weak";
}) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-lg font-semibold tabular-nums ${tone === "weak" ? "text-weak" : ""}`}>
        {value}
      </span>
    </div>
  );
}
