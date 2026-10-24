"use client";

import { AlertTriangle } from "lucide-react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { ConcentrationResult } from "@/lib/portfolio/concentration";

const COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#db2777", "#64748b", "#0891b2", "#9333ea"];

interface ConcentrationChartProps {
  concentration: ConcentrationResult;
}

/** Sector-weight donut with concentration warning badges. */
export function ConcentrationChart({ concentration }: ConcentrationChartProps) {
  const data = concentration.sectorWeights.map((s) => ({
    name: s.sector,
    value: Number((s.weight * 100).toFixed(1)),
  }));

  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No priced holdings yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2}>
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number) => `${v}%`} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {concentration.flags.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {concentration.flags.map((f, i) => (
            <li
              key={i}
              className="flex items-start gap-2 rounded-md border border-average/40 bg-average/10 px-3 py-2 text-xs text-average-foreground"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-average" aria-hidden="true" />
              <span className="text-foreground">{f}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          No single sector above 40% or single stock above 25%.
        </p>
      )}
    </div>
  );
}
