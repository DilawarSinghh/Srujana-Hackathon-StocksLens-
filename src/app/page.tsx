import Link from "next/link";
import { siteConfig } from "@/config/site";
import { getStockListing, sectorsOf } from "@/lib/data/stocks";
import {
  isCategoryKey,
  filterByCategory,
  filterBySector,
  sortForCategory,
  type CategoryKey,
} from "@/lib/data/categories";
import { Disclaimer } from "@/components/disclaimer";
import { DataFreshness } from "@/components/data-freshness";
import { SearchBar } from "@/components/search-bar";
import { CategoryTabs } from "@/components/category-tabs";
import { StockCard } from "@/components/stock-card";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Card, CardContent } from "@/components/ui/card";

// Server-rendered from cached Supabase data; refresh every 15 minutes.
export const revalidate = 900;

interface HomePageProps {
  searchParams: Promise<{ tab?: string; sector?: string }>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const { tab, sector } = await searchParams;
  const activeTab: CategoryKey = isCategoryKey(tab) ? tab : "large";
  const activeSector = sector ?? null;

  const { items, lastUpdated, error } = await getStockListing();
  const sectors = sectorsOf(items);

  const filtered = sortForCategory(
    filterBySector(filterByCategory(items, activeTab), activeSector),
    activeTab,
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="container flex flex-col gap-8 py-10">
        {/* Hero */}
        <section className="flex flex-col items-center gap-4 py-6 text-center">
          <h1 className="max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">
            {siteConfig.tagline}
          </h1>
          <p className="max-w-2xl text-muted-foreground">
            Transparent fundamental scores, filings-grounded answers, and
            portfolio risk tools for Indian retail investors.
          </p>
          <SearchBar className="max-w-xl" />
          <Disclaimer className="max-w-xl" />
        </section>

        {/* Listing */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xl font-semibold">Top-scored by fundamentals</h2>
              <Link
                href="/methodology"
                className="text-sm text-primary underline-offset-4 hover:underline"
              >
                How is this calculated?
              </Link>
            </div>
            <DataFreshness lastUpdated={lastUpdated} />
          </div>

          <CategoryTabs
            activeTab={activeTab}
            activeSector={activeSector}
            sectors={sectors}
          />

          {error ? (
            <ErrorState />
          ) : filtered.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((stock) => (
                <StockCard key={stock.id} stock={stock} />
              ))}
            </div>
          )}
        </section>
      </div>
    </TooltipProvider>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="p-8 text-center text-sm text-muted-foreground">
        No stocks match this category yet. Try a different tab or sector, or run
        the data pipeline (<code>pnpm seed</code> → <code>pnpm fetch</code> →{" "}
        <code>pnpm score</code>).
      </CardContent>
    </Card>
  );
}

function ErrorState() {
  return (
    <Card className="border-destructive/40">
      <CardContent className="p-8 text-center text-sm text-destructive">
        We couldn&apos;t load stock data right now. Please refresh in a moment.
      </CardContent>
    </Card>
  );
}
