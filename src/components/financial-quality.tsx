import { CheckCircle2, MinusCircle } from "lucide-react";
import type { Tables } from "@/types/database";
import { Badge } from "@/components/ui/badge";
import { PIOTROSKI_CRITERIA } from "@/lib/scoring/explanations";
import { NOT_AVAILABLE } from "@/lib/format";

interface FinancialQualityProps {
  metrics: Tables<"stock_metrics"> | null;
}

const ALTMAN_ZONE_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  safe: { label: "Safe zone", variant: "secondary" },
  grey: { label: "Grey zone", variant: "outline" },
  distress: { label: "Distress zone", variant: "destructive" },
  not_applicable: { label: "Not applicable", variant: "outline" },
};

const DIVIDEND_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  strong: { label: "Strong", variant: "secondary" },
  moderate: { label: "Moderate", variant: "outline" },
  weak: { label: "Weak", variant: "destructive" },
  not_available: { label: NOT_AVAILABLE, variant: "outline" },
};

/**
 * Financial quality card: Piotroski F-Score (with the criteria checklist),
 * Altman Z'' zone, and dividend safety. All values are code-computed; NULLs
 * render "Not available". No advice, no predictions.
 */
export function FinancialQuality({ metrics }: FinancialQualityProps) {
  const piotroski = metrics?.piotroski_score ?? null;
  const available = metrics?.piotroski_available_criteria ?? 0;
  const altmanZone = metrics?.altman_zone ?? null;
  const altmanZ = metrics?.altman_z ?? null;
  const dividendSafety = metrics?.dividend_safety ?? "not_available";
  const payout = metrics?.dividend_payout_ratio ?? null;

  const altman = ALTMAN_ZONE_LABEL[altmanZone ?? "not_applicable"];
  const dividend = DIVIDEND_LABEL[dividendSafety];

  return (
    <div className="flex flex-col gap-4 text-sm">
      {/* Piotroski */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="font-medium">Piotroski F-Score</span>
          <span className="tabular-nums">
            {piotroski != null ? `${piotroski} / 9` : "Not enough data"}
          </span>
        </div>
        {piotroski != null ? (
          <>
            <ul className="mt-2 space-y-1">
              {PIOTROSKI_CRITERIA.map((label) => (
                <li key={label} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span>{label}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Based on {available} of 9 criteria with available data.
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Fewer than 6 criteria had available data, so no score is shown.
          </p>
        )}
      </div>

      {/* Altman */}
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">Altman Z&apos;&apos;-Score</p>
          <p className="text-[11px] text-muted-foreground">
            Historical distress indicator, not a prediction.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {altmanZ != null ? (
            <span className="tabular-nums">{altmanZ.toFixed(2)}</span>
          ) : null}
          <Badge variant={altman.variant}>{altman.label}</Badge>
        </div>
      </div>

      {/* Dividend safety */}
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">Dividend safety</p>
          {payout != null ? (
            <p className="text-[11px] text-muted-foreground">
              Payout ratio {(payout * 100).toFixed(0)}%.
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {dividendSafety === "not_available" ? (
            <MinusCircle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          ) : null}
          <Badge variant={dividend.variant}>{dividend.label}</Badge>
        </div>
      </div>
    </div>
  );
}
