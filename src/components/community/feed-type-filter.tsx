"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { CommunityPostType } from "@/types/database";
import { cn } from "@/lib/utils";

/**
 * Compact content-type filter, layered on top of the engagement tabs. Only
 * exposes types that exist in the data model (no fabricated "Questions"
 * category). Driven by the `?type=` search param; preserves the active `?tab=`.
 */
const FILTERS: { value: CommunityPostType | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "discussion", label: "Discussions" },
  { value: "analysis", label: "Analysis" },
  { value: "thesis", label: "Theses" },
  { value: "portfolio_review", label: "Portfolios" },
  { value: "poll", label: "Polls" },
];

export function FeedTypeFilter({ active }: { active: CommunityPostType | "all" }) {
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <div
      className="flex flex-wrap gap-1.5 px-4 py-2.5"
      role="group"
      aria-label="Filter by post type"
    >
      {FILTERS.map((f) => {
        const sp = new URLSearchParams(params.toString());
        if (f.value === "all") sp.delete("type");
        else sp.set("type", f.value);
        const isActive = active === f.value;
        return (
          <Link
            key={f.value}
            href={`${pathname}?${sp.toString()}`}
            aria-current={isActive ? "true" : undefined}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              isActive
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-accent",
            )}
          >
            {f.label}
          </Link>
        );
      })}
    </div>
  );
}
