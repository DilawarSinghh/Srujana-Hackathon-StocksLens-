import type { Metadata } from "next";
import Link from "next/link";
import {
  PILLAR_WEIGHTS,
  PILLAR_LABELS,
  PILLAR_METRICS,
  GOVERNANCE_RULES,
  RED_FLAG_DEFINITIONS,
  LABEL_THRESHOLDS,
  LIMITED_DATA_CONFIDENCE,
  RED_FLAG_CAP,
  MIN_PEERS,
  FORMULA_VERSION,
  PIOTROSKI_RULES,
  ALTMAN_RULES,
  DIVIDEND_RULES,
  type PillarKey,
} from "@/lib/scoring/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Disclaimer } from "@/components/disclaimer";

export const metadata: Metadata = {
  title: "Methodology",
  description:
    "How FilingLens computes its transparent Fundamental Score: pillars, weights, sector-percentile method, red-flag caps, labels, data sources, and limitations.",
  openGraph: {
    title: "Methodology — FilingLens",
    description:
      "How the transparent Fundamental Score is computed. Educational, not investment advice.",
    type: "article",
  },
};

const PILLAR_ORDER: PillarKey[] = [
  "profitability",
  "growth",
  "financial_health",
  "valuation",
  "governance",
  "stability",
];

export default function MethodologyPage() {
  return (
    <div className="container flex max-w-3xl flex-col gap-8 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Methodology</h1>
        <p className="text-muted-foreground">
          The Fundamental Score (0–100) is computed entirely in code from public
          financial data and company filings. It is a transparent, educational
          summary — not a rating, recommendation, or prediction.
        </p>
        <Disclaimer />
        <p className="text-xs text-muted-foreground">
          Formula version {FORMULA_VERSION}
        </p>
      </header>

      <Section title="The six pillars and weights">
        <p className="mb-3 text-sm text-muted-foreground">
          The total score is a weighted sum of six pillars, each scored 0–100.
          Weights sum to 100.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-2 font-medium">Pillar</th>
                <th className="py-2 font-medium">Weight</th>
                <th className="py-2 font-medium">Metrics (direction)</th>
              </tr>
            </thead>
            <tbody>
              {PILLAR_ORDER.map((pillar) => (
                <tr key={pillar} className="border-b border-border/60 align-top">
                  <td className="py-2 font-medium">{PILLAR_LABELS[pillar]}</td>
                  <td className="py-2 tabular-nums">{PILLAR_WEIGHTS[pillar]}%</td>
                  <td className="py-2 text-muted-foreground">
                    {pillar === "governance"
                      ? "Rule-based (see below)"
                      : PILLAR_METRICS[pillar]
                          .map(
                            (m) =>
                              `${m.label} (${m.direction === "high" ? "higher better" : "lower better"})`,
                          )
                          .join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="How each metric is scored">
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>
            Each metric is <strong>percentile-ranked within the stock&apos;s
            sector</strong> (0–100). For &quot;lower is better&quot; metrics
            (e.g. debt/equity, P/E, volatility) the percentile is flipped so a
            lower value scores higher.
          </li>
          <li>
            If fewer than {MIN_PEERS} sector peers have a given metric, the whole
            universe is used as the peer group and the stock is marked with a
            low-peer-count note.
          </li>
          <li>
            A pillar score is the average of its available metric percentiles.
            <strong> Banks and NBFCs</strong> skip debt/equity and operating
            cash-flow metrics (not meaningful for lenders) and the remaining
            weights are renormalised.
          </li>
        </ul>
      </Section>

      <Section title="Financial quality (Piotroski, Altman, dividend)">
        <p className="mb-3 text-sm text-muted-foreground">
          Three extra, code-computed quality checks feed the Financial Health
          pillar and a dedicated card on each stock page. They are historical
          indicators, not predictions.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>
            <strong>Piotroski F-Score (0–9):</strong> {PIOTROSKI_RULES.criteria}{" "}
            {PIOTROSKI_RULES.missing} It is percentile-ranked within the sector
            as one Financial Health metric.
          </li>
          <li>
            <strong>Altman Z&apos;&apos;-Score:</strong> {ALTMAN_RULES.formula}{" "}
            {ALTMAN_RULES.zones} It contributes direct Financial Health points
            (safe 100, grey 50, distress 10).
          </li>
          <li>
            <strong>Dividend safety:</strong> {DIVIDEND_RULES.payout}{" "}
            {DIVIDEND_RULES.safety}
          </li>
        </ul>
      </Section>

      <Section title="Governance (rule-based)">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>Promoter pledge: {GOVERNANCE_RULES.pledge}</li>
          <li>Auditor opinion: {GOVERNANCE_RULES.auditor}</li>
          <li>Related-party trend: {GOVERNANCE_RULES.relatedParty}</li>
          <li>Promoter holding change: {GOVERNANCE_RULES.promoterHoldingChange}</li>
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          The governance score is the average of the available sub-scores;
          &quot;unknown&quot; values are skipped.
        </p>
      </Section>

      <Section title="Red-flag caps">
        <p className="mb-3 text-sm text-muted-foreground">
          Each rule is checked only when the underlying data exists. If any{" "}
          <strong>capping</strong> flag triggers, the total score is capped at{" "}
          <strong>{RED_FLAG_CAP}</strong>. Flags marked{" "}
          <em>informational</em> are shown but never change the score.
        </p>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          {RED_FLAG_DEFINITIONS.map((f) => (
            <li key={f.code}>
              <strong>{f.title}:</strong> {f.rule}
              {"informational" in f && f.informational ? (
                <span className="ml-1 italic">(informational only)</span>
              ) : null}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Labels and missing data">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>
            <strong>Strong fundamentals</strong>: score ≥ {LABEL_THRESHOLDS.strong}.
          </li>
          <li>
            <strong>Average fundamentals</strong>: {LABEL_THRESHOLDS.average}–
            {LABEL_THRESHOLDS.strong - 1}.
          </li>
          <li>
            <strong>Weak fundamentals</strong>: below {LABEL_THRESHOLDS.average}.
          </li>
          <li>
            Null metrics are dropped and the remaining weights renormalised; if a
            whole pillar is missing, its weight is redistributed proportionally.
            Data confidence = available ÷ expected metrics. Below{" "}
            {LIMITED_DATA_CONFIDENCE} it is labelled{" "}
            <strong>Limited data</strong>.
          </li>
        </ul>
      </Section>

      <Section title="Data sources">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>
            Price and financial data: Yahoo Finance (via an unofficial library).
          </li>
          <li>Filings: company annual reports and other official documents.</li>
          <li>
            Governance data (promoter pledge, auditor opinion, related-party
            trend, shareholding): manually entered from BSE/NSE shareholding
            patterns and annual reports.
          </li>
        </ul>
        <p className="mt-2 text-sm text-muted-foreground">
          Data is refreshed on a nightly schedule. Money values are in INR crore.
        </p>
      </Section>

      <Section title="Known limitations">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>Prices are delayed, not real-time.</li>
          <li>
            The demo universe is small and chosen for sector diversity, not as a
            curated list.
          </li>
          <li>Governance data is entered manually and may be incomplete.</li>
          <li>
            The market-data source is unofficial and can have gaps or errors; we
            store missing values as &quot;Not available&quot; rather than guess.
          </li>
        </ul>
      </Section>

      <Section title="What this is — and isn't">
        <p className="text-sm text-muted-foreground">
          FilingLens is an <strong>educational research tool</strong>. It helps
          you read a company&apos;s fundamentals and filings in plain language.
          It is <strong>not</strong> investment advice, a recommendation, a
          rating, or a prediction. It never tells you what to do with your money,
          never handles money, and never places orders — you trade through your
          own broker. The score summarises historical fundamentals; it does not
          forecast future returns.
        </p>
      </Section>

      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <Disclaimer />
        <p className="mt-2 text-sm text-muted-foreground">
          Questions about a specific score? Open any{" "}
          <Link href="/" className="text-primary underline-offset-4 hover:underline">
            stock page
          </Link>{" "}
          to see its per-pillar breakdown and the exact numbers behind it.
        </p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
