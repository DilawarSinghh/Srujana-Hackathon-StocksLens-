"use client";

import * as React from "react";
import { toast } from "sonner";
import { toggleFollow } from "@/app/community/actions";
import { Button } from "@/components/ui/button";

/** Follow / unfollow a user with optimistic toggle. */
export function FollowButton({
  followeeId,
  initialFollowing,
  signedIn,
}: {
  followeeId: string;
  initialFollowing: boolean;
  signedIn: boolean;
}) {
  const [following, setFollowing] = React.useState(initialFollowing);
  const [busy, setBusy] = React.useState(false);

  async function onClick() {
    if (!signedIn) {
      toast.error("Sign in to follow investors.");
      return;
    }
    if (busy) return;
    setBusy(true);
    const next = !following;
    setFollowing(next);
    const res = await toggleFollow(followeeId);
    setBusy(false);
    if (!res.ok) {
      setFollowing(!next);
      toast.error(res.error ?? "Could not update.");
    }
  }

  return (
    <Button onClick={onClick} disabled={busy} variant={following ? "outline" : "default"} size="sm">
      {following ? "Following" : "Follow"}
    </Button>
  );
}
