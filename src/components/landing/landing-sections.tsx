import {
  BarChart3,
  FileSearch,
  Gauge,
  Layers,
  LineChart,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Presentational landing sections (features, how-it-works, trust) for the
 * public marketing page. No market numbers are rendered here — real stock data
 * and scores live in the authenticated Stock Explorer (/stocks).
 */

const FEATURES: { icon: typeof Gauge; title: string; body: string }[] = [
  {
    icon: Gauge,
    title: "Transparent fundamental score",
    body: "A 0–100 score built from six pillars — profitability, growth, financial health, valuation, governance and stability — computed in code, never by the AI.",
  },
  {
    icon: BarChart3,
    title: "Financial-health analysis",
    body: "Margins, leverage, interest coverage, cash-flow quality, Piotroski and Altman signals, with missing data shown as “Not available” rather than zero.",
  },
  {
    icon: LineChart,
    title: "Historical risk metrics",
    body: "Annualised volatility, maximum drawdown and beta versus the Nifty 50, calculated from delayed daily prices with a documented lookback.",
  },
  {
    icon: Layers,
    title: "Portfolio Risk Lab",
    body: "Concentration, correlation, portfolio beta and per-holding volatility contribution for the holdings you add — with the assumptions shown.",
  },
  {
    icon: Scale,
    title: "Scenarios & allocation comparison",
    body: "Hypothetical market-decline, sector, rate and currency shocks, plus side-by-side comparison of alternative allocations. Clearly labelled as estimates.",
  },
  {
    icon: FileSearch,
    title: "Filings-grounded AI",
    body: "Ask questions answered only from a company’s official filings, with page-level citations and a fact-audit. It explains the numbers; it never invents them.",
  },
];

const STEPS: { n: string; title: string; body: string }[] = [
  {
    n: "1",
    title: "Search a stock",
    body: "Find an NSE/BSE company by name or ticker and open its detail page.",
  },
  {
    n: "2",
    title: "Examine the fundamentals",
    body: "Read the six-pillar score, financial-health flags and historical risk — each traceable to the underlying data.",
  },
  {
    n: "3",
    title: "Build a portfolio",
    body: "Add holdings with quantity and average buy price. Watchlist and holdings stay separate.",
  },
  {
    n: "4",
    title: "Stress-test & compare",
    body: "Run hypothetical scenarios, compare allocations and see where your portfolio may conflict with your stated risk profile.",
  },
];

const TRUST: { title: string; body: string }[] = [
  {
    title: "Where the data comes from",
    body: "Market data and fundamentals are fetched from Yahoo Finance into our database on a schedule; pages read from that store. Prices are delayed.",
  },
  {
    title: "How the numbers are produced",
    body: "Every score, ratio and risk metric is computed by deterministic, unit-tested code. The language model only explains results — it cannot change them.",
  },
  {
    title: "Historical vs. hypothetical",
    body: "Historical observations and hypothetical scenario estimates are shown separately and labelled. Scenario results are estimates, not predictions.",
  },
  {
    title: "What this is not",
    body: "StockLens is an educational research tool. It is not a brokerage, gives no buy/sell/hold advice, and makes no claim of complete market coverage.",
  },
];

export function LandingSections() {
  return (
    <>
      {/* Features */}
      <section aria-labelledby="features-heading" className="flex flex-col gap-4">
        <h2 id="features-heading" className="text-xl font-semibold">
          Built for serious research
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Card key={f.title} className="h-full">
              <CardContent className="flex flex-col gap-2 p-5">
                <f.icon className="h-5 w-5 text-primary" aria-hidden="true" />
                <h3 className="font-semibold">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section aria-labelledby="how-heading" className="flex flex-col gap-4">
        <h2 id="how-heading" className="text-xl font-semibold">
          How it works
        </h2>
        <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <li key={s.n}>
              <Card className="h-full">
                <CardContent className="flex flex-col gap-2 p-5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {s.n}
                  </span>
                  <h3 className="font-semibold">{s.title}</h3>
                  <p className="text-sm text-muted-foreground">{s.body}</p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      {/* Trust & transparency */}
      <section aria-labelledby="trust-heading" className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
          <h2 id="trust-heading" className="text-xl font-semibold">
            Trust &amp; transparency
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {TRUST.map((t) => (
            <Card key={t.title}>
              <CardContent className="flex flex-col gap-1.5 p-5">
                <h3 className="font-semibold">{t.title}</h3>
                <p className="text-sm text-muted-foreground">{t.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </>
  );
}
