"use client";

import * as React from "react";
import {
  Bar,
  CartesianGrid,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTheme } from "next-themes";
import type { Tables } from "@/types/database";
import { formatCrore, formatPercentFromFraction } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface FinancialsChartProps {
  fundamentals: Tables<"fundamentals_annual">[];
}

/** 5-year financials with a chart/table toggle. */
export function FinancialsChart({ fundamentals }: FinancialsChartProps) {
  const { resolvedTheme } = useTheme();
  const [view, setView] = React.useState<"chart" | "table">("chart");
  const dark = resolvedTheme === "dark";

  if (fundamentals.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Financial statements not available.
      </p>
    );
  }

  const rows = fundamentals.map((f) => ({
    year: `FY${String(f.fiscal_year).slice(-2)}`,
    revenue: f.revenue,
    netProfit: f.net_profit,
    debt: f.total_debt,
    // operating margin as a percent number for the line axis
    margin:
      f.operating_profit != null && f.revenue != null && f.revenue !== 0
        ? (f.operating_profit / f.revenue) * 100
        : null,
  }));

  const axisColor = dark ? "#94a3b8" : "#475569";
  const gridColor = dark ? "#1e293b" : "#e2e8f0";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end gap-1">
        <Button
          variant={view === "chart" ? "default" : "outline"}
          size="sm"
          onClick={() => setView("chart")}
        >
          Chart
        </Button>
        <Button
          variant={view === "table" ? "default" : "outline"}
          size="sm"
          onClick={() => setView("table")}
        >
          Table
        </Button>
      </div>

      {view === "chart" ? (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <CartesianGrid stroke={gridColor} vertical={false} />
              <XAxis dataKey="year" stroke={axisColor} fontSize={12} />
              <YAxis
                yAxisId="left"
                stroke={axisColor}
                fontSize={12}
                tickFormatter={(v) => `${Math.round(v / 1000)}K`}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke={axisColor}
                fontSize={12}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                contentStyle={{
                  background: dark ? "#0f172a" : "#fff",
                  border: `1px solid ${gridColor}`,
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value: number, name: string) =>
                  name === "Op. margin"
                    ? [`${value?.toFixed(1)}%`, name]
                    : [formatCrore(value), name]
                }
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="left" dataKey="revenue" name="Revenue" fill="#2563eb" radius={[3, 3, 0, 0]} />
              <Bar yAxisId="left" dataKey="netProfit" name="Net profit" fill="#16a34a" radius={[3, 3, 0, 0]} />
              <Bar yAxisId="left" dataKey="debt" name="Total debt" fill="#f59e0b" radius={[3, 3, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="margin" name="Op. margin" stroke="#db2777" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fiscal year</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Net profit</TableHead>
                <TableHead className="text-right">Op. margin</TableHead>
                <TableHead className="text-right">Total debt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fundamentals.map((f) => (
                <TableRow key={f.fiscal_year}>
                  <TableCell>FY{f.fiscal_year}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCrore(f.revenue)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCrore(f.net_profit)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {f.operating_profit != null && f.revenue
                      ? formatPercentFromFraction(f.operating_profit / f.revenue)
                      : "Not available"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatCrore(f.total_debt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Values in ₹ crore.</p>
    </div>
  );
}
