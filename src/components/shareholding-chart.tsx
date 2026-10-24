"use client";

import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { Tables } from "@/types/database";

interface ShareholdingChartProps {
  governance: Tables<"governance_inputs"> | null;
}

const COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#64748b"];

/** Promoter / FII / DII / Public breakdown, or "Not available". */
export function ShareholdingChart({ governance }: ShareholdingChartProps) {
  const slices = [
    { name: "Promoter", value: governance?.promoter_holding_pct },
    { name: "FII", value: governance?.fii_pct },
    { name: "DII", value: governance?.dii_pct },
    { name: "Public", value: governance?.public_pct },
  ].filter((s): s is { name: string; value: number } => s.value != null);

  if (slices.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Shareholding pattern not available.
      </p>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="name"
            innerRadius={50}
            outerRadius={85}
            paddingAngle={2}
          >
            {slices.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
