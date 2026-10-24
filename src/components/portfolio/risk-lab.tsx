"use client";

import * as React from "react";
import type { PositionValue } from "@/lib/portfolio/types";
import {
  runScenario,
  defaultAssumptions,
  SCENARIO_DISCLAIMER,
  type Scenario,
  type ScenarioAssumptions,
} from "@/lib/portfolio/scenarios";
import { compareAllocations } from "@/lib/portfolio/comparison";
import { ASSUMPTION_NOTES, SCENARIO_BOUNDS } from "@/config/scenario-assumptions";
import { formatSignedRupee } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";

type ScenarioType = Scenario["type"];

interface RiskLabProps {
  positions: PositionValue[];
  betaEntries: [string, number | null][];
  sectors: string[];
}

const SCENARIO_LABELS: Record<ScenarioType, string> = {
  market_decline: "Market decline",
  sector_shock: "Sector shock",
  rate_change: "Interest-rate change",
  currency_move: "Currency (USD/INR) move",
};

/**
 * Client-side scenario lab: pick a hypothetical scenario, edit assumptions, see
 * per-holding + total impact recompute instantly, and compare an alternative
 * allocation side by side. All results are hypothetical and labelled so.
 */
export function RiskLab({ positions, betaEntries, sectors }: RiskLabProps) {
  const betaBySymbol = React.useMemo(
    () => new Map<string, number | null>(betaEntries),
    [betaEntries],
  );
  const [assumptions, setAssumptions] = React.useState<ScenarioAssumptions>(
    defaultAssumptions,
  );
  const [type, setType] = React.useState<ScenarioType>("market_decline");
  const [marketShock, setMarketShock] = React.useState(-10);
  const [sector, setSector] = React.useState(sectors[0] ?? "");
  const [sectorShock, setSectorShock] = React.useState(-20);
  const [bps, setBps] = React.useState(100);
  const [fx, setFx] = React.useState(5);

  const scenario: Scenario = React.useMemo(() => {
    switch (type) {
      case "sector_shock":
        return { type, sector, shockPct: sectorShock, spillover: assumptions.spillover };
      case "rate_change":
        return { type, bps };
      case "currency_move":
        return { type, movePct: fx };
      default:
        return { type: "market_decline", marketShockPct: marketShock };
    }
  }, [type, sector, sectorShock, bps, fx, marketShock, assumptions.spillover]);

  const result = React.useMemo(
    () => runScenario(positions, betaBySymbol, scenario, assumptions),
    [positions, betaBySymbol, scenario, assumptions],
  );

  // --- alternative allocation (edit weights, not saved) ---
  const [altWeights, setAltWeights] = React.useState<Record<string, number>>({});
  const priced = positions.filter((p) => p.value != null && p.value > 0);
  const totalValue = priced.reduce((s, p) => s + (p.value as number), 0);

  const resetAlt = React.useCallback(() => setAltWeights({}), []);

  const alternative: PositionValue[] = React.useMemo(() => {
    if (Object.keys(altWeights).length === 0) return priced;
    // Re-weight to the user's chosen weights, keeping total value fixed.
    const sum = priced.reduce(
      (s, p) => s + (altWeights[p.symbol] ?? (p.weight ?? 0) * 100),
      0,
    );
    if (sum <= 0) return priced;
    return priced.map((p) => {
      const w = (altWeights[p.symbol] ?? (p.weight ?? 0) * 100) / sum;
      const value = totalValue * w;
      return { ...p, value, weight: w };
    });
  }, [altWeights, priced, totalValue]);

  const comparison = React.useMemo(
    () => compareAllocations(priced, alternative, betaBySymbol, scenario, assumptions),
    [priced, alternative, betaBySymbol, scenario, assumptions],
  );

  const showComparison = Object.keys(altWeights).length > 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Scenario picker */}
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(SCENARIO_LABELS) as ScenarioType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={
              "rounded-full border px-3 py-1.5 text-xs " +
              (t === type
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:bg-accent")
            }
          >
            {SCENARIO_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Scenario controls */}
      <div className="rounded-lg border-2 border-dashed border-average/50 bg-average/5 p-4">
        {type === "market_decline" && (
          <SliderRow
            label="Market shock"
            value={marketShock}
            min={SCENARIO_BOUNDS.marketDeclinePct.min}
            max={SCENARIO_BOUNDS.marketDeclinePct.max}
            suffix="%"
            onChange={setMarketShock}
          />
        )}
        {type === "sector_shock" && (
          <div className="flex flex-col gap-3">
            <label className="flex items-center justify-between text-sm">
              <span>Sector</span>
              <select
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                className="rounded-md border border-input bg-background px-2 py-1 text-sm"
              >
                {sectors.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <SliderRow
              label="Sector shock"
              value={sectorShock}
              min={SCENARIO_BOUNDS.sectorShockPct.min}
              max={SCENARIO_BOUNDS.sectorShockPct.max}
              suffix="%"
              onChange={setSectorShock}
            />
          </div>
        )}
        {type === "rate_change" && (
          <SliderRow
            label="Rate change"
            value={bps}
            min={SCENARIO_BOUNDS.rateChangeBps.min}
            max={SCENARIO_BOUNDS.rateChangeBps.max}
            step={25}
            suffix=" bps"
            onChange={setBps}
          />
        )}
        {type === "currency_move" && (
          <SliderRow
            label="Rupee move (+ = depreciation)"
            value={fx}
            min={SCENARIO_BOUNDS.currencyMovePct.min}
            max={SCENARIO_BOUNDS.currencyMovePct.max}
            suffix="%"
            onChange={setFx}
          />
        )}

        {/* Hypothetical result */}
        <div className="mt-4 flex flex-wrap items-end gap-6">
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">
              Estimated impact (hypothetical)
            </span>
            <span className="text-lg font-semibold tabular-nums text-weak">
              {formatSignedRupee(result.totalImpactValue)} (
              {result.totalImpactPct.toFixed(1)}%)
            </span>
          </div>
        </div>
        <ul className="mt-3 space-y-1 text-xs">
          {result.perHolding.map((h) => (
            <li key={h.symbol} className="flex justify-between tabular-nums">
              <span>
                {h.symbol}
                {h.assumed ? <span className="text-muted-foreground"> *</span> : null}
              </span>
              <span className="text-weak">
                {formatSignedRupee(h.impactValue)} ({h.impactPct.toFixed(1)}%)
              </span>
            </li>
          ))}
        </ul>
        {result.perHolding.some((h) => h.assumed) ? (
          <p className="mt-1 text-[11px] text-muted-foreground">
            * Used an assumed value (beta 1.0 or default sector sensitivity).
          </p>
        ) : null}
        <p className="mt-2 rounded-md bg-background/60 px-3 py-2 text-[11px] text-muted-foreground">
          {SCENARIO_DISCLAIMER}
        </p>
      </div>

      {/* Editable assumptions */}
      <details className="rounded-lg border border-border p-3 text-sm">
        <summary className="cursor-pointer font-medium">
          Assumptions and limits
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <AssumptionRow
            label="Sector-shock spillover"
            value={assumptions.spillover}
            step={0.05}
            onChange={(v) =>
              setAssumptions((a) => ({ ...a, spillover: v }))
            }
            note={ASSUMPTION_NOTES.spillover}
          />
          <p className="text-[11px] text-muted-foreground">{ASSUMPTION_NOTES.beta}</p>
          <p className="text-[11px] text-muted-foreground">{ASSUMPTION_NOTES.rate}</p>
          <p className="text-[11px] text-muted-foreground">{ASSUMPTION_NOTES.currency}</p>
          <p className="text-[11px] text-muted-foreground">
            These are assumptions, not measured values. Edit them to see the
            estimate change instantly.
          </p>
        </div>
      </details>

      {/* Allocation comparison */}
      <div className="rounded-lg border border-border p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium">Compare an alternative allocation</p>
          <Button variant="ghost" size="sm" onClick={resetAlt} className="h-7 text-xs">
            Reset to current
          </Button>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Edit target weights (%) to test a different mix. Nothing is saved.
        </p>
        <div className="flex flex-col gap-2">
          {priced.map((p) => (
            <div key={p.symbol} className="flex items-center justify-between gap-3 text-sm">
              <span className="w-28 truncate">{p.symbol}</span>
              <span className="text-xs text-muted-foreground">
                now {((p.weight ?? 0) * 100).toFixed(0)}%
              </span>
              <Input
                type="number"
                min="0"
                max="100"
                step="1"
                className="w-24"
                aria-label={`Alternative weight for ${p.symbol}`}
                value={
                  altWeights[p.symbol] ?? Math.round((p.weight ?? 0) * 100)
                }
                onChange={(e) =>
                  setAltWeights((w) => ({
                    ...w,
                    [p.symbol]: Number(e.target.value),
                  }))
                }
              />
            </div>
          ))}
        </div>

        {showComparison ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-1">Metric</th>
                  <th className="py-1 text-right">Current</th>
                  <th className="py-1 text-right">Alternative</th>
                  <th className="py-1 text-right">Change</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                <CmpRow
                  label="Single-stock HHI"
                  cur={comparison.current.hhi.toFixed(3)}
                  alt={comparison.alternative.hhi.toFixed(3)}
                  chg={comparison.delta.hhi.toFixed(3)}
                />
                <CmpRow
                  label="Portfolio beta"
                  cur={comparison.current.beta?.toFixed(2) ?? "—"}
                  alt={comparison.alternative.beta?.toFixed(2) ?? "—"}
                  chg={comparison.delta.beta?.toFixed(2) ?? "—"}
                />
                <CmpRow
                  label="Scenario impact %"
                  cur={`${comparison.current.scenarioImpactPct.toFixed(1)}%`}
                  alt={`${comparison.alternative.scenarioImpactPct.toFixed(1)}%`}
                  chg={`${comparison.delta.scenarioImpactPct.toFixed(1)}%`}
                />
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Hypothetical comparison based on stated assumptions. Not a prediction.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="font-semibold tabular-nums">
          {value}
          {suffix}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
        aria-label={label}
      />
    </div>
  );
}

function AssumptionRow({
  label,
  value,
  step,
  onChange,
  note,
}: {
  label: string;
  value: number;
  step: number;
  onChange: (v: number) => void;
  note: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-sm">{label}</span>
        <Input
          type="number"
          step={step}
          min="0"
          max="1"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-24"
          aria-label={label}
        />
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{note}</p>
    </div>
  );
}

function CmpRow({
  label,
  cur,
  alt,
  chg,
}: {
  label: string;
  cur: string;
  alt: string;
  chg: string;
}) {
  return (
    <tr className="border-b border-border/60">
      <td className="py-1">{label}</td>
      <td className="py-1 text-right">{cur}</td>
      <td className="py-1 text-right">{alt}</td>
      <td className="py-1 text-right">{chg}</td>
    </tr>
  );
}
