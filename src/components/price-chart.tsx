"use client";

import * as React from "react";
import {
  createChart,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import { useTheme } from "next-themes";
import type { PricePoint } from "@/lib/data/stock-detail";
import { cn } from "@/lib/utils";

const RANGES = [
  { key: "1M", days: 30 },
  { key: "6M", days: 182 },
  { key: "1Y", days: 365 },
  { key: "5Y", days: 365 * 5 },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

interface PriceChartProps {
  data: PricePoint[];
}

/** Theme-aware area price chart with range selectors. Delayed data. */
export function PriceChart({ data }: PriceChartProps) {
  const { resolvedTheme } = useTheme();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const chartRef = React.useRef<IChartApi | null>(null);
  const seriesRef = React.useRef<ISeriesApi<"Area"> | null>(null);
  const [range, setRange] = React.useState<RangeKey>("1Y");

  const dark = resolvedTheme === "dark";

  // Filter to the selected range.
  const visible = React.useMemo(() => {
    const days = RANGES.find((r) => r.key === range)!.days;
    if (data.length === 0) return [];
    const cutoff = new Date(data[data.length - 1].date);
    cutoff.setDate(cutoff.getDate() - days);
    return data
      .filter((p) => new Date(p.date) >= cutoff)
      .map((p) => ({ time: p.date as Time, value: p.close }));
  }, [data, range]);

  // Create chart once.
  React.useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: dark ? "#94a3b8" : "#475569",
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: dark ? "#1e293b" : "#f1f5f9" },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true },
      crosshair: { mode: 1 },
      height: 300,
      autoSize: true,
    });
    const series = chart.addAreaSeries({
      lineColor: "#2563eb",
      topColor: "rgba(37, 99, 235, 0.25)",
      bottomColor: "rgba(37, 99, 235, 0.02)",
      lineWidth: 2,
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    });
    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
    // Recreate on theme change to re-apply colors.
  }, [dark]);

  // Update data.
  React.useEffect(() => {
    if (seriesRef.current) {
      seriesRef.current.setData(visible);
      chartRef.current?.timeScale().fitContent();
    }
  }, [visible]);

  if (data.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-md border border-border text-sm text-muted-foreground">
        Price history not available.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Delayed data</span>
        <div role="group" aria-label="Chart range" className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              aria-pressed={range === r.key}
              className={cn(
                "rounded px-2 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                range === r.key
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent",
              )}
            >
              {r.key}
            </button>
          ))}
        </div>
      </div>
      <div ref={containerRef} className="h-[300px] w-full" />
    </div>
  );
}
