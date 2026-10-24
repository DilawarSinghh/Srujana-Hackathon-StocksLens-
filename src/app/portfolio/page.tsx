import { redirect } from "next/navigation";
import { getCurrentUser, getDisplayName } from "@/lib/auth";
import { getPortfolio, getReturnsForSymbols } from "@/lib/data/portfolio";
import { positionValues, computeConcentration } from "@/lib/portfolio/concentration";
import { computePortfolioBeta } from "@/lib/portfolio/beta";
import { computePortfolioVolatility } from "@/lib/portfolio/volatility";
import { formatPrice, formatPercentFromFraction } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Disclaimer } from "@/components/disclaimer";
import { DataFreshness } from "@/components/data-freshness";
import { AddHoldingForm } from "@/components/portfolio/add-holding-form";
import { PortfolioTable } from "@/components/portfolio/portfolio-table";
import { ConcentrationChart } from "@/components/portfolio/concentration-chart";
import { StressTestPanel } from "@/components/portfolio/stress-test-panel";
import { WhatIfSimulator } from "@/components/portfolio/what-if-simulator";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/portfolio");

  const portfolio = await getPortfolio(user.id);
  const holdings = portfolio?.holdings ?? [];
  const { positions, totalValue } = positionValues(holdings);
  const concentration = computeConcentration(positions);
  const betaResult = computePortfolioBeta(
    positions,
    new Map(holdings.map((h) => [h.symbol, h.beta])),
  );

  // Volatility from 1y daily returns (covariance matrix).
  const returns = await getReturnsForSymbols(holdings.map((h) => h.symbol));
  const weightBySymbol = new Map(
    positions.filter((p) => p.weight != null).map((p) => [p.symbol, p.weight as number]),
  );
  const vol = computePortfolioVolatility(weightBySymbol, returns);

  const isEmpty = holdings.length === 0;

  return (
    <div className="container flex flex-col gap-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Portfolio</h1>
          <p className="text-sm text-muted-foreground">
            {getDisplayName(user)}
          </p>
        </div>
        <DataFreshness lastUpdated={portfolio?.lastUpdated ?? null} />
      </div>

      <Disclaimer />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a holding</CardTitle>
        </CardHeader>
        <CardContent>
          <AddHoldingForm />
        </CardContent>
      </Card>

      {isEmpty ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Your portfolio is empty. Add a holding above to see concentration,
            beta, and the market-drop stress test.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Holdings · {formatPrice(totalValue)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PortfolioTable positions={positions} />
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sector concentration</CardTitle>
              </CardHeader>
              <CardContent>
                <ConcentrationChart concentration={concentration} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Risk (historical)</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <Row
                  label="Portfolio beta"
                  value={
                    betaResult.beta != null
                      ? `${betaResult.beta.toFixed(2)} (covers ${(betaResult.coveredWeight * 100).toFixed(0)}% of value)`
                      : "Not available"
                  }
                />
                <Row
                  label="1y volatility (annualised)"
                  value={
                    vol.volatility != null
                      ? formatPercentFromFraction(vol.volatility)
                      : vol.reason === "insufficient_history"
                        ? `Not available (need ≥60 overlapping days; have ${vol.overlapDays})`
                        : "Not available"
                  }
                />
                <Row label="Single-stock HHI" value={concentration.hhi.toFixed(3)} />
                <p className="text-xs text-muted-foreground">
                  Beta and volatility are based on historical daily returns, not
                  predictions.
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">What-if simulator</CardTitle>
            </CardHeader>
            <CardContent>
              <WhatIfSimulator holdings={holdings} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Stress test</CardTitle>
            </CardHeader>
            <CardContent>
              <StressTestPanel />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium tabular-nums">{value}</span>
    </div>
  );
}
