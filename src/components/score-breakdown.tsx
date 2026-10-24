import { AlertTriangle } from "lucide-react";
import {
  PILLAR_WEIGHTS,
  PILLAR_LABELS,
  RED_FLAG_CAP,
  type PillarKey,
} from "@/lib/scoring/constants";
import type { Tables, ScoreExplanations } from "@/types/database";
import { cn } from "@/lib/utils";
import { ScoreBadge } from "@/components/score-badge";

interface ScoreBreakdownProps {
  score: Tables<"scores"> | null;
  explanations: ScoreExplanations | null;
}

const PILLAR_ORDER: PillarKey[] = [
  "profitability",
  "growth",
  "financial_health",
  "valuation",
  "governance",
  "stability",
];

/** Six-pillar score breakdown with weights and plain-English reasons. */
export function ScoreBreakdown({ score, explanations }: ScoreBreakdownProps) {
  if (!score) {
    return (
      <p className="text-sm text-muted-foreground">
        This stock has not been scored yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold tabular-nums">
            {score.total_score == null ? "—" : Math.round(score.total_score)}
          </span>
          <span className="text-sm text-muted-foreground">/ 100</span>
        </div>
        <ScoreBadge score={score.total_score} label={score.label} size="md" />
      </div>

      {score.capped ? (
        <div
          role="note"
          className="flex items-start gap-2 rounded-md border border-weak/40 bg-weak/10 px-3 py-2 text-sm text-weak"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Score capped at {RED_FLAG_CAP} due to red flags.</span>
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        {PILLAR_ORDER.map((pillar) => {
          const value = score[pillar] as number | null;
          const weight = PILLAR_WEIGHTS[pillar];
          const sentences = explanations?.[pillar] ?? [];
          return (
            <div key={pillar} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{PILLAR_LABELS[pillar]}</span>
                <span className="text-muted-foreground">
                  <span className="tabular-nums">
                    {value == null ? "N/A" : Math.round(value)}
                  </span>
                  <span className="ml-1 text-xs">· weight {weight}%</span>
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full", barColor(value))}
                  style={{ width: `${value == null ? 0 : Math.max(2, value)}%` }}
                  role="meter"
                  aria-valuenow={value ?? 0}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${PILLAR_LABELS[pillar]} score`}
                />
              </div>
              {sentences.length > 0 ? (
                <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {sentences.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function barColor(value: number | null): string {
  if (value == null) return "bg-muted-foreground/30";
  if (value >= 70) return "bg-strong";
  if (value >= 40) return "bg-average";
  return "bg-weak";
}
