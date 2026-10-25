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
import { LandingSections } from "@/components/landing/landing-sections";
import { Button } from "@/components/ui/button";
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
      {/* Hero */}
      <section className="hero-glow border-b border-border">
        <div className="container flex flex-col items-center gap-5 py-14 text-center sm:py-20">
          <span className="rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
            Educational research for Indian (NSE/BSE) investors
          </span>
          <h1 className="max-w-3xl text-3xl font-bold tracking-tight sm:text-5xl">
            {siteConfig.tagline}
          </h1>
          <p className="max-w-2xl text-balance text-muted-foreground sm:text-lg">
            Transparent fundamental scores, filings-grounded answers, and
            portfolio risk tools — every number traceable to a source or a
            documented calculation.
          </p>
          <SearchBar className="w-full max-w-xl" />
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link href="#explore">Start analysing</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="#features-heading">Explore features</Link>
            </Button>
          </div>
          <Disclaimer className="max-w-xl" />
        </div>
      </section>

      <div className="container flex flex-col gap-12 py-12">
        {/* Explanatory sections (presentational, no live figures) */}
        <LandingSections />

        {/* Listing — real sourced data */}
        <section id="explore" className="flex scroll-mt-20 flex-col gap-4">
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
          ) : items.length === 0 ? (
            <NoDataState />
          ) : filtered.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((stock) => (
                <StockCard
                  key={stock.id}
                  stock={stock}
                  showDividendSafety={activeTab === "high_dividend"}
                />
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

function NoDataState() {
  return (
    <Card>
      <CardContent className="p-8 text-center text-sm text-muted-foreground">
        Market data hasn&apos;t been loaded yet. Run the data scripts to populate
        it: <code>pnpm seed</code> → <code>pnpm fetch</code> →{" "}
        <code>pnpm score</code>.
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
