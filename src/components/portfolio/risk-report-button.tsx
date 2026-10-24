"use client";

import * as React from "react";
import { FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StressResult } from "@/lib/portfolio/stress";
import {
  generateRiskReportPdf,
  type RiskReportModel,
} from "@/lib/portfolio/risk-report";

/** The base report model minus the stress scenario (fetched at export time). */
export type RiskReportBase = Omit<RiskReportModel, "generatedAt" | "stress">;

/**
 * Client-only "Export risk report" button. Builds the report model, fetches a
 * hypothetical stress scenario, and renders a PDF via the lazily-imported
 * jsPDF. Disabled for empty portfolios.
 */
export function RiskReportButton({
  base,
  defaultShockPct = -10,
}: {
  base: RiskReportBase;
  defaultShockPct?: number;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const empty = base.holdings.length === 0;

  async function exportReport() {
    setBusy(true);
    setError(null);
    try {
      // Fetch a hypothetical stress scenario (best-effort; report still works
      // without it).
      let stress: StressResult | null = null;
      try {
        const res = await fetch("/api/portfolio/stress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ marketShockPct: defaultShockPct }),
        });
        if (res.ok) {
          const data = (await res.json()) as { result: StressResult };
          stress = data.result ?? null;
        }
      } catch {
        /* keep stress null */
      }

      await generateRiskReportPdf(
        { ...base, generatedAt: new Date().toISOString(), stress },
        `portfolio-risk-report-${new Date().toISOString().slice(0, 10)}.pdf`,
      );
    } catch {
      setError("Could not generate the report. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={exportReport}
        disabled={busy || empty}
        className="gap-2"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FileDown className="h-4 w-4" />
        )}
        Export risk report
      </Button>
      {error ? (
        <span role="alert" className="text-xs text-weak">
          {error}
        </span>
      ) : null}
    </div>
  );
}
