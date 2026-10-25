"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, X } from "lucide-react";
import type { SearchResult } from "@/app/api/search/route";
import { createShare } from "@/app/community/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface PortfolioOption {
  id: string;
  name: string;
}

/**
 * Create a revocable portfolio share. The user chooses a real portfolio or
 * enters a hypothetical allocation, then explicitly selects which fields to
 * disclose. A live preview summarizes exactly what others will see before
 * publishing. Defaults to the least sensitive useful disclosure.
 */
export function CreateShareForm({
  portfolios,
  signedIn,
}: {
  portfolios: PortfolioOption[];
  signedIn: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = React.useState<"real" | "hypothetical">(
    portfolios.length > 0 ? "real" : "hypothetical",
  );
  const [portfolioId, setPortfolioId] = React.useState(portfolios[0]?.id ?? "");
  const [title, setTitle] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [visibility, setVisibility] = React.useState<"public" | "unlisted" | "private">("public");

  // Disclosure flags — least sensitive useful defaults.
  const [showHoldings, setShowHoldings] = React.useState(true);
  const [showAllocations, setShowAllocations] = React.useState(true);
  const [showSectors, setShowSectors] = React.useState(true);
  const [showRiskMetrics, setShowRiskMetrics] = React.useState(true);
  const [showQuantities, setShowQuantities] = React.useState(false);
  const [showAmounts, setShowAmounts] = React.useState(false);

  // Review context.
  const [objective, setObjective] = React.useState("");
  const [horizon, setHorizon] = React.useState("");
  const [riskTolerance, setRiskTolerance] = React.useState("");
  const [feedbackWanted, setFeedbackWanted] = React.useState("");

  // Hypothetical holdings.
  const [manual, setManual] = React.useState<{ symbol: string; allocationPct: string }[]>([]);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    const term = query.trim();
    if (term.length < 1 || mode !== "hypothetical") {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
      if (res.ok) setResults(((await res.json()) as { results: SearchResult[] }).results);
    }, 250);
    return () => clearTimeout(t);
  }, [query, mode]);

  if (!signedIn) {
    return (
      <p className="text-sm text-muted-foreground">
        <a href="/login?next=/community/portfolio/new" className="text-primary hover:underline">Sign in</a> to share a portfolio.
      </p>
    );
  }

  async function submit() {
    if (pending || title.trim().length === 0) return;
    setPending(true);
    const input: Record<string, unknown> = {
      title: title.trim(),
      notes: notes || undefined,
      visibility,
      isHypothetical: mode === "hypothetical",
      showHoldings,
      showQuantities,
      showAmounts,
      showAllocations,
      showSectors,
      showRiskMetrics,
      objective: objective || undefined,
      horizon: horizon || undefined,
      riskTolerance: riskTolerance || undefined,
      feedbackWanted: feedbackWanted || undefined,
    };
    if (mode === "real") input.sourcePortfolioId = portfolioId;
    else
      input.manualHoldings = manual
        .filter((m) => m.symbol.trim().length > 0)
        .map((m) => ({ symbol: m.symbol, allocationPct: m.allocationPct ? Number(m.allocationPct) : undefined }));

    const res = await createShare(input);
    setPending(false);
    if (res.ok && res.data) {
      toast.success("Portfolio share created.");
      router.push(`/community/portfolio/${res.data.id}`);
    } else {
      toast.error(res.error ?? "Could not create the share.");
    }
  }

  const visible: string[] = [];
  if (showHoldings) visible.push("holdings");
  if (showAllocations) visible.push("allocation %");
  if (showQuantities) visible.push("quantities");
  if (showAmounts) visible.push("invested amounts");
  if (showSectors) visible.push("sectors");
  if (showRiskMetrics) visible.push("risk metrics");

  return (
    <div className="flex flex-col gap-4">
      {/* Source. */}
      <div>
        <p className="mb-1 text-sm font-medium">Source</p>
        <div className="flex gap-1">
          {portfolios.length > 0 ? (
            <button
              type="button"
              onClick={() => setMode("real")}
              className={cn("rounded-md border px-2.5 py-1 text-xs", mode === "real" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}
            >
              My portfolio
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setMode("hypothetical")}
            className={cn("rounded-md border px-2.5 py-1 text-xs", mode === "hypothetical" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}
          >
            Hypothetical allocation
          </button>
        </div>
      </div>

      {mode === "real" ? (
        <select
          value={portfolioId}
          onChange={(e) => setPortfolioId(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          aria-label="Select portfolio"
        >
          {portfolios.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="relative">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Add a stock to the hypothetical allocation…" aria-label="Search stock" />
            {results.length > 0 ? (
              <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-md">
                {results.map((r) => (
                  <li key={r.symbol}>
                    <button
                      type="button"
                      onClick={() => {
                        if (!manual.some((m) => m.symbol === r.symbol)) setManual([...manual, { symbol: r.symbol, allocationPct: "" }]);
                        setQuery("");
                        setResults([]);
                      }}
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
          {manual.map((m, i) => (
            <div key={m.symbol} className="flex items-center gap-2">
              <span className="w-24 text-sm font-medium">${m.symbol}</span>
              <Input
                type="number"
                min="0"
                max="100"
                value={m.allocationPct}
                onChange={(e) => setManual(manual.map((x, j) => (j === i ? { ...x, allocationPct: e.target.value } : x)))}
                placeholder="Alloc %"
                className="w-28"
                aria-label={`${m.symbol} allocation percent`}
              />
              <button type="button" onClick={() => setManual(manual.filter((_, j) => j !== i))} aria-label={`Remove ${m.symbol}`}>
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Allocations are normalized to 100%. Leave blank for equal weight.</p>
        </div>
      )}

      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Share title (e.g. My long-term core)" maxLength={120} aria-label="Share title" />
      <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" maxLength={1000} aria-label="Notes" />

      {/* Visibility. */}
      <div>
        <p className="mb-1 text-sm font-medium">Visibility</p>
        <div className="flex gap-1">
          {(["public", "unlisted", "private"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVisibility(v)}
              className={cn("rounded-md border px-2.5 py-1 text-xs capitalize", visibility === v ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}
            >
              {v}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Public: anyone can find it. Unlisted: only people with the link. Private: only you.
        </p>
      </div>

      {/* Disclosure. */}
      <div>
        <p className="mb-1 text-sm font-medium">What to disclose</p>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          <Toggle label="Show holdings" checked={showHoldings} onChange={setShowHoldings} />
          <Toggle label="Show allocation %" checked={showAllocations} onChange={setShowAllocations} disabled={!showHoldings} />
          <Toggle label="Show sectors" checked={showSectors} onChange={setShowSectors} disabled={!showHoldings} />
          <Toggle label="Show risk metrics" checked={showRiskMetrics} onChange={setShowRiskMetrics} />
          <Toggle label="Show quantities (sensitive)" checked={showQuantities} onChange={setShowQuantities} disabled={!showHoldings || mode === "hypothetical"} />
          <Toggle label="Show invested amounts (sensitive)" checked={showAmounts} onChange={setShowAmounts} disabled={!showHoldings || mode === "hypothetical"} />
        </div>
      </div>

      {/* Review request. */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Input value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Objective / goal" maxLength={300} aria-label="Objective" />
        <Input value={horizon} onChange={(e) => setHorizon(e.target.value)} placeholder="Horizon (e.g. 5 years)" maxLength={60} aria-label="Horizon" />
        <Input value={riskTolerance} onChange={(e) => setRiskTolerance(e.target.value)} placeholder="Risk tolerance" maxLength={60} aria-label="Risk tolerance" />
        <Input value={feedbackWanted} onChange={(e) => setFeedbackWanted(e.target.value)} placeholder="What feedback do you want?" maxLength={500} aria-label="Feedback wanted" />
      </div>

      {/* Preview. */}
      <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Others will see:</span>{" "}
        {visible.length > 0 ? visible.join(", ") : "only the title and notes"}.
        {mode === "hypothetical" ? " Marked as a hypothetical allocation." : ""} Quantities and
        invested amounts are hidden unless you turn them on.
      </div>

      <Button onClick={submit} disabled={pending || title.trim().length === 0} className="gap-1.5 self-start">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Publish share
      </Button>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={cn("flex items-center gap-2 text-sm", disabled && "opacity-50")}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-input"
      />
      {label}
    </label>
  );
}
