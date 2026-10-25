"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function CommunityError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="container flex min-h-[50vh] flex-col items-center justify-center gap-4 py-10 text-center">
      <h1 className="text-xl font-semibold">Couldn&apos;t load the community</h1>
      <p className="max-w-md text-sm text-muted-foreground">Please try again in a moment.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
