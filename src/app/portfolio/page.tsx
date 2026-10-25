import { redirect } from "next/navigation";
import { getCurrentUser, getDisplayName } from "@/lib/auth";
import {
  getPortfolio,
  getReturnsForSymbols,
  getPortfolioProfile,
} from "@/lib/data/portfolio";
import { positionValues, computeConcentration } from "@/lib/portfolio/concentration";
import { computePortfolioBeta } from "@/lib/portfolio/beta";
import { computePortfolioVolatility } from "@/lib/portfolio/volatility";
import {
  computeCorrelationMatrix,
  computeVolatilityContributions,
} from "@/lib/portfolio/correlation";
import {
  evaluateGoalConflicts,
  type PortfolioObservations,
} from "@/lib/portfolio/goal-conflicts";
import { formatPrice, formatPercentFromFraction } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Disclaimer } from "@/components/disclaimer";
import { DataFreshness } from "@/components/data-freshness";
import { AddHoldingForm } from "@/components/portfolio/add-holding-form";
import { PortfolioTable } from "@/components/portfolio/portfolio-table";
import { RiskReportButton, type RiskReportBase } from "@/components/portfolio/risk-report-button";
import { ConcentrationChart } from "@/components/charts/lazy";
import { StressTestPanel } from "@/components/portfolio/stress-test-panel";
import { WhatIfSimulator } from "@/components/portfolio/what-if-simulator";
import { CorrelationHeatmap } from "@/components/portfolio/correlation-heatmap";
import { RiskLab } from "@/components/portfolio/risk-lab";
import { ProfileForm } from "@/components/portfolio/profile-form";
import { SamplePortfolioButton } from "@/components/portfolio/sample-portfolio-button";
import { ExplainRiskButton } from "@/components/portfolio/explain-risk-button";

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

  // Correlation + per-holding volatility contribution (F-06 "relationships").
  const pricedSymbols = positions
    .filter((p) => p.weight != null)
    .map((p) => p.symbol);
  const correlation = computeCorrelationMatrix(pricedSymbols, returns);
  const volContrib = computeVolatilityContributions(weightBySymbol, returns);

  // Investor profile + goal-conflict warnings.
  const portfolioId = portfolio?.portfolioId ?? null;
  const profile = portfolioId ? await getPortfolioProfile(portfolioId) : null;
  const smallCapWeight = positions
    .filter((p) => p.weight != null)
    .reduce((s, p) => {
      const h = holdings.find((x) => x.symbol === p.symbol);
      return h?.capCategory === "small" ? s + (p.weight as number) : s;
    }, 0);
  const obs: PortfolioObservations = {
    beta: betaResult.beta,
    volatility: vol.volatility,
    smallCapWeight,
    topSectorWeight: concentration.topSector?.weight ?? 0,
    topSectorName: concentration.topSector?.sector ?? null,
    illiquidWeight: smallCapWeight, // small-cap proxy for liquidity risk
  };
  const goalConflicts = profile ? evaluateGoalConflicts(profile, obs) : [];

  // Serializable data for the client Risk Lab.
  const betaEntries: [string, number | null][] = holdings.map((h) => [
    h.symbol,
    h.beta,
  ]);
  const sectors = [
    ...new Set(positions.map((p) => p.sector).filter((s): s is string => !!s)),
  ].sort();

  // Serializable base for the client-side risk-report PDF.
  const qualityBySymbol = new Map(
    holdings.map((h) => [h.symbol, { piotroski: h.piotroskiScore, altman: h.altmanZone }]),
  );
  const riskReportBase: RiskReportBase = {
    dataFreshness: portfolio?.lastUpdated ?? null,
    totalValue,
    holdings: positions.map((p) => ({
      symbol: p.symbol,
      name: p.name,
      sector: p.sector,
      quantity: p.quantity,
      value: p.value,
      weight: p.weight,
      piotroskiScore: qualityBySymbol.get(p.symbol)?.piotroski ?? null,
      altmanZone: qualityBySymbol.get(p.symbol)?.altman ?? null,
    })),
    sectorWeights: concentration.sectorWeights,
    concentrationFlags: concentration.flags,
    hhi: concentration.hhi,
    beta: betaResult.beta,
    betaCoveredWeight: betaResult.coveredWeight,
    volatility: vol.volatility,
    averageCorrelation: correlation.averageCorrelation,
    volContributions: volContrib.contributions,
    goalConflicts: goalConflicts.map((c) => ({
      message: c.message,
      rule: c.rule,
      numbers: c.numbers,
    })),
  };

  return (
    <div className="container flex flex-col gap-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Portfolio</h1>
          <p className="text-sm text-muted-foreground">
            {getDisplayName(user)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <DataFreshness lastUpdated={portfolio?.lastUpdated ?? null} />
          <RiskReportButton base={riskReportBase} />
        </div>
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
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center text-sm text-muted-foreground">
            <p>
              Your portfolio is empty. Add a holding above to see concentration,
              correlation, scenarios, and goal-conflict checks — or load a demo
              portfolio to explore instantly.
            </p>
            <SamplePortfolioButton />
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

          {/* Risk profile + goal-conflict warnings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your risk profile</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ProfileForm initial={profile} />
              {!profile ? (
                <p className="text-xs text-muted-foreground">
                  Set your profile to see goal-conflict checks (horizon, risk
                  tolerance, and near-term liquidity vs your holdings).
                </p>
              ) : goalConflicts.length === 0 ? (
                <p className="text-sm text-strong">
                  No goal conflicts detected between your profile and this
                  portfolio.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {goalConflicts.map((c) => (
                    <li
                      key={c.code}
                      className="rounded-md border border-average/40 bg-average/10 px-3 py-2 text-sm"
                    >
                      <p>{c.message}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Rule: {c.rule} · {c.numbers}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Correlation + volatility contribution */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                How your holdings move together
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {correlation.averageCorrelation != null ? (
                <p className="text-sm text-muted-foreground">
                  Average pairwise correlation of your holdings is{" "}
                  <span className="font-medium text-foreground">
                    {correlation.averageCorrelation.toFixed(2)}
                  </span>
                  . Values near +1 move together (less diversification); near 0
                  move independently; below 0 tend to offset.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Not enough overlapping price history yet to compute
                  correlations (need ≥60 common days per pair).
                </p>
              )}
              <CorrelationHeatmap result={correlation} />
              {volContrib.contributions.length > 0 ? (
                <div>
                  <p className="mb-1 text-sm font-medium">
                    Contribution to portfolio volatility
                  </p>
                  <ul className="space-y-1 text-xs">
                    {[...volContrib.contributions]
                      .sort((a, b) => b.contribution - a.contribution)
                      .map((c) => (
                        <li key={c.symbol} className="flex justify-between tabular-nums">
                          <span>{c.symbol}</span>
                          <span>{(c.contribution * 100).toFixed(1)}%</span>
                        </li>
                      ))}
                  </ul>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Historical observation from the covariance of 1y daily
                    returns.
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Explain my portfolio&apos;s risk
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ExplainRiskButton />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">What-if simulator</CardTitle>
            </CardHeader>
            <CardContent>
              <WhatIfSimulator holdings={holdings} />
            </CardContent>
          </Card>

          {/* Scenario lab (F-06 scenarios + assumptions + comparison) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Scenario lab (hypothetical)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RiskLab
                positions={positions}
                betaEntries={betaEntries}
                sectors={sectors}
              />
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
