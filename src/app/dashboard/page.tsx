import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Layers, PieChart, TrendingUp, Wallet } from "lucide-react";
import { getCurrentUser, getDisplayName } from "@/lib/auth";
import { getPortfolio } from "@/lib/data/portfolio";
import {
  positionValues,
  computeConcentration,
} from "@/lib/portfolio/concentration";
import { computePortfolioBeta } from "@/lib/portfolio/beta";
import { formatPrice } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Disclaimer } from "@/components/disclaimer";
import { DataFreshness } from "@/components/data-freshness";
import { SearchBar } from "@/components/search-bar";
import { SamplePortfolioButton } from "@/components/portfolio/sample-portfolio-button";
import { PageContainer } from "@/components/shell/page-container";
import { PageHeader } from "@/components/shell/page-header";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard",
  description:
    "Your StockLens dashboard: portfolio value, holdings, and risk overview. Educational, not investment advice.",
};

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dashboard");

  const portfolio = await getPortfolio(user.id);
  const holdings = portfolio?.holdings ?? [];
  const { positions, totalValue } = positionValues(holdings);
  const concentration = computeConcentration(positions);
  const beta = computePortfolioBeta(
    positions,
    new Map(holdings.map((h) => [h.symbol, h.beta])),
  );

  const pricedCount = positions.filter((p) => p.value != null).length;
  const hasPrices = pricedCount > 0;
  const isEmpty = holdings.length === 0;

  return (
    <PageContainer>
      <PageHeader
        title={`Welcome back, ${getDisplayName(user)}`}
        description="A quick overview of your portfolio and risk."
        actions={<DataFreshness lastUpdated={portfolio?.lastUpdated ?? null} />}
      />

      <Disclaimer />

      {isEmpty ? (
        <EmptyDashboard />
      ) : (
        <>
          {/* Summary tiles — real values only; "Not available" when unpriced. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              icon={Wallet}
              label="Portfolio value"
              value={hasPrices ? formatPrice(totalValue) : "Not available"}
              hint={
                hasPrices
                  ? "Based on delayed prices"
                  : "Prices not loaded yet"
              }
            />
            <SummaryCard
              icon={Layers}
              label="Holdings"
              value={String(holdings.length)}
              hint={
                pricedCount < holdings.length
                  ? `${pricedCount} priced`
                  : "All priced"
              }
            />
            <SummaryCard
              icon={PieChart}
              label="Top sector"
              value={
                concentration.topSector
                  ? concentration.topSector.sector
                  : "Not available"
              }
              hint={
                concentration.topSector
                  ? `${(concentration.topSector.weight * 100).toFixed(0)}% of value`
                  : undefined
              }
            />
            <SummaryCard
              icon={TrendingUp}
              label="Portfolio beta"
              value={beta.beta != null ? beta.beta.toFixed(2) : "Not available"}
              hint={
                beta.beta != null
                  ? `Covers ${(beta.coveredWeight * 100).toFixed(0)}% of value`
                  : "Historical, not a prediction"
              }
            />
          </div>

          {concentration.flags.length > 0 ? (
            <Card className="border-average/40">
              <CardHeader>
                <CardTitle className="text-base">Concentration notes</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-2 text-sm">
                  {concentration.flags.map((f) => (
                    <li
                      key={f}
                      className="rounded-md border border-average/40 bg-average/10 px-3 py-2"
                    >
                      {f}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ToolCard
              href="/portfolio#risk-lab"
              title="Risk Lab"
              body="Concentration, correlation, scenarios, and goal-conflict checks."
            />
            <ToolCard
              href="/"
              title="Explore stocks"
              body="Browse fundamental scores by category and sector."
            />
            <ToolCard
              href="/chat"
              title="AI Chat"
              body="Ask grounded questions about any supported company."
            />
            <ToolCard
              href="/debate"
              title="AI Debate"
              body="Bull vs Devil's Advocate vs an independent Judge."
            />
          </div>
        </>
      )}
    </PageContainer>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-5">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="h-4 w-4" aria-hidden="true" />
          <span className="text-xs font-medium">{label}</span>
        </div>
        <p className="truncate text-xl font-semibold nums">{value}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function ToolCard({
  href,
  title,
  body,
}: {
  href: string;
  title: string;
  body: string;
}) {
  return (
    <Card className="transition-colors hover:border-primary/40">
      <CardContent className="p-5">
        <Link href={href} className="flex items-start justify-between gap-3">
          <span>
            <span className="block font-semibold">{title}</span>
            <span className="mt-1 block text-sm text-muted-foreground">
              {body}
            </span>
          </span>
          <ArrowRight
            className="mt-1 h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        </Link>
      </CardContent>
    </Card>
  );
}

function EmptyDashboard() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-5 p-8 text-center">
        <div>
          <h2 className="text-lg font-semibold">Start building your view</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            You don&apos;t have any holdings yet. Search for a stock to research
            it, or load a demo portfolio to explore the risk tools instantly.
          </p>
        </div>
        <SearchBar className="w-full max-w-md" />
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button asChild variant="outline">
            <Link href="/">Explore stocks</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/debate">Try an AI Debate</Link>
          </Button>
          <SamplePortfolioButton />
        </div>
      </CardContent>
    </Card>
  );
}
