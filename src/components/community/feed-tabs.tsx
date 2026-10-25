"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import type { FeedTab } from "@/lib/community/queries";

const TABS: { value: FeedTab; label: string }[] = [
  { value: "foryou", label: "For You" },
  { value: "following", label: "Following" },
  { value: "trending", label: "Trending" },
  { value: "latest", label: "Latest" },
];

/** Feed filter tabs. The active tab is driven by the ?tab= search param. */
export function FeedTabs({ active }: { active: FeedTab }) {
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <div className="flex border-b border-border" role="tablist" aria-label="Feed filters">
      {TABS.map((t) => {
        const sp = new URLSearchParams(params.toString());
        sp.set("tab", t.value);
        return (
          <Link
            key={t.value}
            href={`${pathname}?${sp.toString()}`}
            role="tab"
            aria-selected={active === t.value}
            className={cn(
              "flex-1 border-b-2 px-3 py-3 text-center text-sm font-medium transition-colors",
              active === t.value
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
