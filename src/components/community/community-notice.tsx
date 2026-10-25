import { Info } from "lucide-react";

/**
 * Standing notice that community content is user-generated opinion, not
 * verified fact, official StockLens ratings, or personalized advice.
 */
export function CommunityNotice() {
  return (
    <div
      role="note"
      className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        Community posts are user-generated opinions, not verified facts, official StockLens ratings,
        or personalized investment advice. StockLens scores shown on stock cards come from the
        deterministic engine; community ratings are subjective.
      </span>
    </div>
  );
}
