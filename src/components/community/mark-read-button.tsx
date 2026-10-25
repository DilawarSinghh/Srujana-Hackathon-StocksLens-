"use client";

import { useRouter } from "next/navigation";
import { markNotificationsRead } from "@/app/community/actions";
import { Button } from "@/components/ui/button";

/** Marks all notifications read, then refreshes. */
export function MarkReadButton({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={async () => {
        await markNotificationsRead();
        router.refresh();
      }}
    >
      Mark all read
    </Button>
  );
}
