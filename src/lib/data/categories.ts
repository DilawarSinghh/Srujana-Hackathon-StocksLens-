import type { StockListItem } from "@/lib/data/stocks";

export const CATEGORY_TABS = [
  { key: "large", label: "Large Cap" },
  { key: "mid", label: "Mid Cap" },
  { key: "small", label: "Small Cap" },
  { key: "low_debt", label: "Low Debt" },
  { key: "high_dividend", label: "High Dividend" },
  { key: "growth", label: "Growth" },
] as const;

export type CategoryKey = (typeof CATEGORY_TABS)[number]["key"];

export function isCategoryKey(v: string | undefined): v is CategoryKey {
  return CATEGORY_TABS.some((t) => t.key === v);
}

/** Filter the universe by category tab. */
export function filterByCategory(
  items: StockListItem[],
  tab: CategoryKey,
): StockListItem[] {
  switch (tab) {
    case "large":
    case "mid":
    case "small":
      return items.filter((i) => i.cap_category === tab);
    case "low_debt":
      return items.filter(
        (i) => i.debt_to_equity != null && i.debt_to_equity < 0.5,
      );
    case "high_dividend":
      return items.filter(
        (i) => i.dividend_yield != null && i.dividend_yield > 2,
      );
    case "growth":
      // Sorted by growth pillar below; filter keeps those with a growth score.
      return items.filter((i) => i.growth != null);
    default:
      return items;
  }
}

/** Optional sector filter. */
export function filterBySector(
  items: StockListItem[],
  sector: string | null,
): StockListItem[] {
  if (!sector) return items;
  return items.filter((i) => i.sector === sector);
}

/**
 * Sort for display: Growth tab sorts by growth pillar; all others by total
 * score descending. "Limited data" stocks always go last. Unscored last.
 */
export function sortForCategory(
  items: StockListItem[],
  tab: CategoryKey,
): StockListItem[] {
  const limited = (i: StockListItem) =>
    i.label === "Limited data" || i.total_score == null ? 1 : 0;

  return [...items].sort((a, b) => {
    const la = limited(a);
    const lb = limited(b);
    if (la !== lb) return la - lb; // non-limited first

    if (tab === "growth") {
      return (b.growth ?? -Infinity) - (a.growth ?? -Infinity);
    }
    return (b.total_score ?? -Infinity) - (a.total_score ?? -Infinity);
  });
}
