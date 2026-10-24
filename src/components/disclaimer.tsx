import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

const DISCLAIMER_TEXT =
  "Educational analysis only. Not investment advice. Prices are delayed.";

interface DisclaimerProps {
  className?: string;
  /** Compact single-line style for footers and chat answers. */
  variant?: "default" | "compact";
}

/**
 * Legal disclaimer shown on every page and chat answer.
 * This tool never provides investment advice.
 */
export function Disclaimer({ className, variant = "default" }: DisclaimerProps) {
  if (variant === "compact") {
    return (
      <p
        className={cn(
          "text-xs text-muted-foreground",
          className,
        )}
      >
        {DISCLAIMER_TEXT}
      </p>
    );
  }

  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground",
        className,
      )}
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{DISCLAIMER_TEXT}</span>
    </div>
  );
}

export { DISCLAIMER_TEXT };
