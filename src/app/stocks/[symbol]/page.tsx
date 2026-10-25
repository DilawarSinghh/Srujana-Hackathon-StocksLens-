import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStockDetail } from "@/lib/data/stock-detail";
import { dayChangePercent, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Disclaimer } from "@/components/disclaimer";
import { DataFreshness } from "@/components/data-freshness";
import { ScoreBadge } from "@/components/score-badge";
import { BrokerDropdown } from "@/components/broker-dropdown";
import {
  PriceChart,
  FinancialsChart,
  ShareholdingChart,
} from "@/components/charts/lazy";
import { KeyStats } from "@/components/key-stats";
import { FinancialQuality } from "@/components/financial-quality";
import { ScoreBreakdown } from "@/components/score-breakdown";
import { RedFlagsBox } from "@/components/red-flags-box";
import { PeerTable } from "@/components/peer-table";
import { ChatSlot } from "@/components/chat/chat-slot";

export const revalidate = 900;

interface StockPageProps {
  params: Promise<{ symbol: string }>;
}

export async function generateMetadata({
  params,
}: StockPageProps): Promise<Metadata> {
  const { symbol } = await params;
  const detail = await getStockDetail(decodeURIComponent(symbol));
  if (!detail) return { title: "Stock not found" };
  const title = `${detail.stock.name} (${detail.stock.symbol})`;
  const description = `Fundamental analysis, financials, and filings-grounded research for ${detail.stock.name}. Educational, not investment advice.`;
  return {
    title,
    description,
    openGraph: { title: `${title} — FilingLens`, description, type: "article" },
    twitter: { card: "summary", title: `${title} — FilingLens`, description },
  };
}

export default async function StockPage({ params }: StockPageProps) {
  const { symbol } = await params;
  const detail = await getStockDetail(decodeURIComponent(symbol));
  if (!detail) notFound();

  const { stock, metrics, score, fundamentals, governance, prices, peers, redFlags, explanations, lastUpdated } = detail;
  const change = dayChangePercent(metrics?.price, metrics?.prev_close);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="container py-8">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold tracking-tight">{stock.name}</h1>
            <p className="text-sm text-muted-foreground">
              {stock.symbol}
              {stock.exchange ? ` · ${stock.exchange}` : ""}
              {stock.sector ? ` · ${stock.sector}` : ""}
            </p>
            <div className="mt-1 flex items-center gap-3">
              <span className="text-xl font-semibold tabular-nums">
                {formatPrice(metrics?.price)}
              </span>
              {change != null ? (
                <span
                  className={cn(
                    "flex items-center gap-0.5 text-sm font-medium tabular-nums",
                    change >= 0 ? "text-strong" : "text-weak",
                  )}
                >
                  {change >= 0 ? (
                    <TrendingUp className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <TrendingDown className="h-4 w-4" aria-hidden="true" />
                  )}
                  {change >= 0 ? "+" : ""}
                  {change.toFixed(2)}%
                </span>
              ) : null}
              <ScoreBadge score={score?.total_score ?? null} label={score?.label ?? null} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <BrokerDropdown />
          </div>
        </div>

        <p className="mt-1 text-xs text-muted-foreground">
          You place orders on your broker. We never handle your money.
        </p>

        {/* Main grid: content + sticky chat */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-6 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Price</CardTitle>
              </CardHeader>
              <CardContent>
                <PriceChart data={prices} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Key stats</CardTitle>
              </CardHeader>
              <CardContent>
                <KeyStats metrics={metrics} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Fundamental score</CardTitle>
              </CardHeader>
              <CardContent>
                <ScoreBreakdown score={score} explanations={explanations} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Financial quality</CardTitle>
              </CardHeader>
              <CardContent>
                <FinancialQuality metrics={metrics} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Red flags</CardTitle>
              </CardHeader>
              <CardContent>
                <RedFlagsBox redFlags={redFlags} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Financials (5 years)</CardTitle>
              </CardHeader>
              <CardContent>
                <FinancialsChart fundamentals={fundamentals} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Shareholding</CardTitle>
              </CardHeader>
              <CardContent>
                <ShareholdingChart governance={governance} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sector peers</CardTitle>
              </CardHeader>
              <CardContent>
                <PeerTable peers={peers} />
              </CardContent>
            </Card>
          </div>

          {/* Chat slot: sticky on desktop, floating sheet on mobile */}
          <aside className="lg:col-span-1">
            <ChatSlot symbol={stock.symbol} name={stock.name} />
          </aside>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <DataFreshness lastUpdated={lastUpdated} />
          <Disclaimer />
        </div>
      </div>
    </TooltipProvider>
  );
}
