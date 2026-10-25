"use client";

import * as React from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { votePoll } from "@/app/community/actions";
import type { PollView } from "@/lib/community/queries";
import { relativeTime } from "@/lib/community/format";

/**
 * Poll display + voting. One vote per user is enforced server-side (DB PK);
 * this UI just reflects state. After a poll closes or the viewer has voted,
 * results (counts + percentages) are shown instead of the voting buttons.
 */
export function PollCard({ poll, signedIn }: { poll: PollView; signedIn: boolean }) {
  const router = useRouter();
  const [voting, setVoting] = React.useState(false);
  const showResults = poll.closed || poll.viewerOptionId != null;

  async function vote(optionId: string) {
    if (!signedIn) {
      toast.error("Sign in to vote.");
      return;
    }
    if (poll.closed || voting) return;
    setVoting(true);
    const res = await votePoll(poll.id, optionId);
    setVoting(false);
    if (res.ok) {
      toast.success("Vote recorded.");
      router.refresh();
    } else {
      toast.error(res.error ?? "Could not vote.");
    }
  }

  return (
    <div className="mt-2 rounded-lg border border-border bg-surface/40 p-3">
      <p className="text-sm font-medium">{poll.question}</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {poll.options.map((o) => {
          const pct = poll.totalVotes > 0 ? (o.votes / poll.totalVotes) * 100 : 0;
          const mine = poll.viewerOptionId === o.id;
          if (showResults) {
            return (
              <li key={o.id} className="relative overflow-hidden rounded-md border border-border">
                <div
                  className={cn("absolute inset-y-0 left-0 bg-primary/15", mine && "bg-primary/30")}
                  style={{ width: `${pct}%` }}
                  aria-hidden="true"
                />
                <div className="relative flex items-center justify-between px-3 py-1.5 text-xs">
                  <span className={cn(mine && "font-semibold")}>{o.label}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {pct.toFixed(0)}% · {o.votes}
                  </span>
                </div>
              </li>
            );
          }
          return (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => vote(o.id)}
                disabled={voting}
                className="w-full rounded-md border border-border px-3 py-1.5 text-left text-xs transition-colors hover:border-primary/50 hover:bg-accent disabled:opacity-50"
              >
                {o.label}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {poll.totalVotes} vote{poll.totalVotes === 1 ? "" : "s"} ·{" "}
        {poll.closed ? "Closed" : `Closes in ${relativeTime(poll.closesAt)}`} · Community opinion,
        not a prediction.
      </p>
    </div>
  );
}
