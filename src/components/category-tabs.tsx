"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { CATEGORY_TABS, type CategoryKey } from "@/lib/data/categories";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CategoryTabsProps {
  activeTab: CategoryKey;
  activeSector: string | null;
  sectors: string[];
}

const ALL_SECTORS = "__all__";

/** Category tabs + sector filter, synced to ?tab= & ?sector= URL params. */
export function CategoryTabs({
  activeTab,
  activeSector,
  sectors,
}: CategoryTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value == null) params.delete(key);
    else params.set(key, value);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div
        role="tablist"
        aria-label="Stock categories"
        className="flex flex-wrap gap-1.5"
      >
        {CATEGORY_TABS.map((t) => {
          const isActive = t.key === activeTab;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => setParam("tab", t.key)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-accent",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <Select
        value={activeSector ?? ALL_SECTORS}
        onValueChange={(v) => setParam("sector", v === ALL_SECTORS ? null : v)}
      >
        <SelectTrigger className="w-full sm:w-48" aria-label="Filter by sector">
          <SelectValue placeholder="All sectors" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_SECTORS}>All sectors</SelectItem>
          {sectors.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
