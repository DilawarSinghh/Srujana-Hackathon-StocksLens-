"use client";

import type { CorrelationResult } from "@/lib/portfolio/correlation";

/** Blue (negative) → white (0) → red (positive) cell background. */
function cellColor(v: number | null): string {
  if (v == null) return "transparent";
  const x = Math.max(-1, Math.min(1, v));
  if (x >= 0) {
    const a = x; // 0..1
    return `rgba(239, 68, 68, ${0.15 + a * 0.6})`; // red scale
  }
  const a = -x;
  return `rgba(59, 130, 246, ${0.15 + a * 0.6})`; // blue scale
}

/**
 * Holdings-by-holdings correlation heatmap of 1y daily returns. Cells show the
 * value; a title attribute gives the tooltip. "—" marks insufficient history.
 */
export function CorrelationHeatmap({ result }: { result: CorrelationResult }) {
  const { symbols, matrix } = result;
  if (symbols.length < 2) {
    return (
      <p className="text-sm text-muted-foreground">
        Add at least two priced holdings to see how they move together.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-xs">
        <thead>
          <tr>
            <th className="p-1" />
            {symbols.map((s) => (
              <th key={s} className="p-1 text-left font-medium text-muted-foreground">
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {symbols.map((rowSym, i) => (
            <tr key={rowSym}>
              <th className="p-1 pr-2 text-right font-medium text-muted-foreground">
                {rowSym}
              </th>
              {symbols.map((colSym, j) => {
                const v = matrix[i][j];
                return (
                  <td
                    key={colSym}
                    className="h-9 w-12 border border-border text-center tabular-nums"
                    style={{ backgroundColor: cellColor(v) }}
                    title={
                      v == null
                        ? `${rowSym} vs ${colSym}: insufficient history`
                        : `${rowSym} vs ${colSym}: ${v.toFixed(2)}`
                    }
                  >
                    {v == null ? "—" : v.toFixed(2)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
