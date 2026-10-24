import { cn } from "@/lib/utils";
import { LABELS } from "@/lib/scoring/constants";

interface ScoreBadgeProps {
  score: number | null;
  label: string | null;
  className?: string;
  size?: "sm" | "md" | "lg";
}

/** Color-coded fundamental-score badge. No buy/sell language. */
export function ScoreBadge({ score, label, className, size = "md" }: ScoreBadgeProps) {
  const tone = toneFor(label);

  const sizeClasses =
    size === "lg"
      ? "text-base px-3 py-1.5 gap-2"
      : size === "sm"
        ? "text-xs px-2 py-0.5 gap-1"
        : "text-sm px-2.5 py-1 gap-1.5";

  const toneClasses: Record<string, string> = {
    strong: "bg-strong/15 text-strong border-strong/30",
    average: "bg-average/15 text-average border-average/30",
    weak: "bg-weak/15 text-weak border-weak/30",
    limited: "bg-muted text-muted-foreground border-border",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-medium",
        sizeClasses,
        toneClasses[tone],
        className,
      )}
      title={label ?? "Not scored"}
    >
      <span className="font-semibold tabular-nums">
        {score == null ? "—" : Math.round(score)}
      </span>
      <span>{label ?? "Not scored"}</span>
    </span>
  );
}

function toneFor(label: string | null): "strong" | "average" | "weak" | "limited" {
  if (label === LABELS.strong) return "strong";
  if (label === LABELS.average) return "average";
  if (label === LABELS.weak) return "weak";
  return "limited";
}
