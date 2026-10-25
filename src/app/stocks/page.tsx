import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
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
import { PageContainer } from "@/components/shell/page-container";
import { PageHeader } from "@/components/shell/page-header";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Card, CardContent } from "@/components/ui/card";

// Reads the session to gate the page; never statically evaluated.
export const dynamic = "force-dynamic";

interface StockExplorerPageProps {
  searchParams: Promise<{ tab?: string; sector?: string }>;
}

/**
 * Stock Explorer — the single authenticated home for browsing and ranking
 * stocks. All stock discovery (cards, fundamental scores, category and sector
 * filters) lives here, not on the public landing page.
 */
export default async function StockExplorerPage({
  searchParams,
}: StockExplorerPageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/stocks");

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
      <PageContainer>
        <PageHeader
          title="Stock Explorer"
          description="Browse and rank NSE/BSE stocks by transparent fundamental scores."
          actions={<DataFreshness lastUpdated={lastUpdated} />}
        />

        <Disclaimer />

        <SearchBar className="w-full max-w-xl" />

        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-semibold">Top-scored by fundamentals</h2>
            <Link
              href="/methodology"
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              How is this calculated?
            </Link>
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
      </PageContainer>
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
