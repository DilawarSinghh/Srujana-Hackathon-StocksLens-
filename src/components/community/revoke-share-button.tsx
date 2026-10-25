"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { revokeShare } from "@/app/community/actions";
import { Button } from "@/components/ui/button";

/** Owner-only: revoke a share so it is no longer publicly visible. */
export function RevokeShareButton({ shareId }: { shareId: string }) {
  const router = useRouter();
  return (
    <Button
      variant="destructive"
      size="sm"
      onClick={async () => {
        if (!confirm("Revoke this share? It will no longer be visible to others.")) return;
        const res = await revokeShare(shareId);
        if (res.ok) {
          toast.success("Share revoked.");
          router.refresh();
        } else toast.error(res.error ?? "Could not revoke.");
      }}
    >
      Revoke share
    </Button>
  );
}
