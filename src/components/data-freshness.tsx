import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface DataFreshnessProps {
  /** ISO date string or Date of the last data update. */
  lastUpdated?: string | Date | null;
  className?: string;
}

function formatRelative(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
}

/** Shows when the underlying data was last refreshed. */
export function DataFreshness({ lastUpdated, className }: DataFreshnessProps) {
  const date = lastUpdated ? new Date(lastUpdated) : null;
  const valid = date && !Number.isNaN(date.getTime());

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-muted-foreground",
        className,
      )}
    >
      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
      <span>
        {valid
          ? `Data updated ${formatRelative(date!)}`
          : "Data freshness unavailable"}
      </span>
    </div>
  );
}
