"use client";

import * as React from "react";
import { toast } from "sonner";
import { toggleStockFollow } from "@/app/community/actions";
import { Button } from "@/components/ui/button";

/** Follow / unfollow a stock for the For You feed. */
export function StockFollowButton({
  symbol,
  initialFollowing,
  signedIn,
}: {
  symbol: string;
  initialFollowing: boolean;
  signedIn: boolean;
}) {
  const [following, setFollowing] = React.useState(initialFollowing);
  const [busy, setBusy] = React.useState(false);

  async function onClick() {
    if (!signedIn) {
      toast.error("Sign in to follow stocks.");
      return;
    }
    if (busy) return;
    setBusy(true);
    const next = !following;
    setFollowing(next);
    const res = await toggleStockFollow(symbol);
    setBusy(false);
    if (!res.ok) {
      setFollowing(!next);
      toast.error(res.error ?? "Could not update.");
    }
  }

  return (
    <Button onClick={onClick} disabled={busy} variant={following ? "outline" : "default"} size="sm">
      {following ? "Following stock" : "Follow stock"}
    </Button>
  );
}
