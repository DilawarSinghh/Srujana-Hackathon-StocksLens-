"use client";

import * as React from "react";
import type { SearchResult } from "@/app/api/search/route";
import type { HoldingWithData } from "@/lib/portfolio/types";
import { positionValues, computeConcentration } from "@/lib/portfolio/concentration";
import { computePortfolioBeta } from "@/lib/portfolio/beta";
import { Input } from "@/components/ui/input";

interface WhatIfSimulatorProps {
  holdings: HoldingWithData[];
}

/**
 * Hypothetical: add an amount of a stock and preview the effect on sector
 * weights, beta, and flags. Does NOT save. Client-side using the same pure
 * functions as the live portfolio.
 */
export function WhatIfSimulator({ holdings }: WhatIfSimulatorProps) {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [picked, setPicked] = React.useState<SearchResult | null>(null);
  const [amount, setAmount] = React.useState("");
  const [extra, setExtra] = React.useState<{ price: number | null; beta: number | null; sector: string | null } | null>(null);

  React.useEffect(() => {
    const term = query.trim();
    if (term.length < 1 || picked) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
      if (res.ok) setResults(((await res.json()) as { results: SearchResult[] }).results);
    }, 250);
    return () => clearTimeout(t);
  }, [query, picked]);

  async function pick(r: SearchResult) {
    setPicked(r);
    setQuery(r.symbol);
    setResults([]);
    // Fetch price + beta + sector for the simulated stock.
    const res = await fetch(`/api/portfolio/quote?symbol=${encodeURIComponent(r.symbol)}`);
    if (res.ok) {
      const data = await res.json();
      setExtra({ price: data.price ?? null, beta: data.beta ?? null, sector: data.sector ?? r.sector });
    } else {
      setExtra({ price: null, beta: null, sector: r.sector });
    }
  }

  const before = React.useMemo(() => summarise(holdings), [holdings]);

  const after = React.useMemo(() => {
    const amt = Number(amount);
    if (!picked || !extra?.price || !Number.isFinite(amt) || amt <= 0) return null;
    const qty = amt / extra.price;
    const simulated: HoldingWithData[] = [
      ...holdings,
      {
        symbol: picked.symbol,
        name: picked.name,
        sector: extra.sector,
        quantity: qty,
        avgBuyPrice: extra.price,
        currentPrice: extra.price,
        beta: extra.beta,
      },
    ];
    return summarise(simulated);
  }, [picked, extra, amount, holdings]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="relative">
          <label className="mb-1 block text-xs text-muted-foreground">Stock to simulate</label>
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPicked(null);
              setExtra(null);
            }}
            placeholder="Search…"
            autoComplete="off"
          />
          {results.length > 0 && !picked ? (
            <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-md">
              {results.map((r) => (
                <li key={r.symbol}>
                  <button
                    type="button"
                    onClick={() => void pick(r)}
                    className="flex w-full flex-col rounded-sm px-3 py-1.5 text-left text-sm hover:bg-accent"
                  >
                    <span className="font-medium">{r.symbol}</span>
                    <span className="truncate text-xs text-muted-foreground">{r.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Amount to invest (₹)</label>
          <Input
            type="number"
            min="0"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 50000"
          />
        </div>
      </div>

      {picked && extra?.price == null ? (
        <p className="text-xs text-muted-foreground">
          No current price available for {picked.symbol}; can&apos;t simulate.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SummaryCard title="Now" summary={before} />
        <SummaryCard title="After (hypothetical)" summary={after} highlight />
      </div>

      <p className="text-[11px] text-muted-foreground">
        Hypothetical preview only. Nothing is saved to your portfolio.
      </p>
    </div>
  );
}

interface Summary {
  beta: number | null;
  topSector: { sector: string; weight: number } | null;
  flags: string[];
}

function summarise(holdings: HoldingWithData[]): Summary {
  const { positions } = positionValues(holdings);
  const conc = computeConcentration(positions);
  const betaResult = computePortfolioBeta(
    positions,
    new Map(holdings.map((h) => [h.symbol, h.beta])),
  );
  return {
    beta: betaResult.beta,
    topSector: conc.topSector,
    flags: conc.flags,
  };
}

function SummaryCard({
  title,
  summary,
  highlight,
}: {
  title: string;
  summary: Summary | null;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-md border p-3 ${highlight ? "border-dashed border-primary/50 bg-primary/5" : "border-border"}`}
    >
      <p className="mb-2 text-xs font-medium">{title}</p>
      {summary == null ? (
        <p className="text-xs text-muted-foreground">Pick a stock and amount.</p>
      ) : (
        <dl className="flex flex-col gap-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Beta</dt>
            <dd className="tabular-nums">{summary.beta != null ? summary.beta.toFixed(2) : "N/A"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Top sector</dt>
            <dd className="tabular-nums">
              {summary.topSector
                ? `${summary.topSector.sector} ${(summary.topSector.weight * 100).toFixed(0)}%`
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Flags</dt>
            <dd className="text-xs">
              {summary.flags.length > 0 ? summary.flags.join(" ") : "None"}
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}
