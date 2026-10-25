import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Standard content container for app-shell pages. Provides consistent
 * horizontal padding, a max content width, and vertical rhythm so every
 * internal page aligns identically regardless of its contents.
 */
export function PageContainer({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8", className)}>
      <div className="flex flex-col gap-6">{children}</div>
    </div>
  );
}
