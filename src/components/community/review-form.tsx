"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createReview } from "@/app/community/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CRITERIA = [
  { key: "diversificationRating", label: "Diversification" },
  { key: "concentrationRating", label: "Concentration" },
  { key: "sectorBalanceRating", label: "Sector balance" },
  { key: "riskAlignmentRating", label: "Risk alignment" },
] as const;

/** Structured review form: 1–5 ratings on four criteria plus a comment. */
export function ReviewForm({ shareId }: { shareId: string }) {
  const router = useRouter();
  const [ratings, setRatings] = React.useState<Record<string, number>>({});
  const [comment, setComment] = React.useState("");
  const [pending, setPending] = React.useState(false);

  async function submit() {
    if (pending) return;
    setPending(true);
    const res = await createReview({ shareId, ...ratings, comment: comment || undefined });
    setPending(false);
    if (res.ok) {
      toast.success("Review submitted.");
      router.refresh();
    } else toast.error(res.error ?? "Could not submit review.");
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Rate 1–5 on each criterion. These are your subjective opinions, not validated scores.
      </p>
      {CRITERIA.map((c) => (
        <div key={c.key} className="flex items-center justify-between gap-2">
          <span className="text-sm">{c.label}</span>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRatings((r) => ({ ...r, [c.key]: n }))}
                className={cn(
                  "h-7 w-7 rounded-md border text-xs tabular-nums",
                  ratings[c.key] === n ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground",
                )}
                aria-label={`${c.label} ${n} of 5`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      ))}
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Comments on diversification, concentration, sector exposure, risk alignment…"
        maxLength={2000}
        rows={3}
        className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm"
        aria-label="Review comment"
      />
      <Button onClick={submit} disabled={pending} className="gap-1.5 self-start">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Submit review
      </Button>
    </div>
  );
}
