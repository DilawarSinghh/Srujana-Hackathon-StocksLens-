/** A portfolio holding enriched with current data for calculations. */
export interface HoldingWithData {
  symbol: string;
  name: string;
  sector: string | null;
  quantity: number;
  avgBuyPrice: number;
  currentPrice: number | null;
  beta: number | null;
}

/** A position's computed value + weight. */
export interface PositionValue {
  symbol: string;
  name: string;
  sector: string | null;
  quantity: number;
  avgBuyPrice: number;
  currentPrice: number | null;
  value: number | null; // qty * currentPrice
  weight: number | null; // fraction of total value
  pnl: number | null; // value - cost
  pnlPct: number | null;
}
