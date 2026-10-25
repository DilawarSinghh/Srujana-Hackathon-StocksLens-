/** TEMP — run the REAL risk engine over a test portfolio of populated stocks. */
import { db } from "./lib/db";
import { positionValues, computeConcentration } from "@/lib/portfolio/concentration";
import { computePortfolioBeta } from "@/lib/portfolio/beta";
import { computePortfolioVolatility } from "@/lib/portfolio/volatility";
import { computeCorrelationMatrix } from "@/lib/portfolio/correlation";
import { runScenario } from "@/lib/portfolio/scenarios";
import type { HoldingWithData } from "@/lib/portfolio/types";

// A realistic 4-stock test portfolio across sectors (all populated).
const TEST = [
  { symbol: "RELIANCE", qty: 10, avg: 1100 },
  { symbol: "TCS", qty: 5, avg: 2400 },
  { symbol: "HDFCBANK", qty: 20, avg: 900 },
  { symbol: "ITC", qty: 50, avg: 400 },
];

async function main() {
  const { data: stocks } = await db
    .from("stocks")
    .select("id, symbol, name, sector, cap_category")
    .in("symbol", TEST.map((t) => t.symbol));
  const { data: metrics } = await db
    .from("stock_metrics")
    .select("stock_id, price, beta")
    .in("stock_id", (stocks ?? []).map((s) => s.id));
  const mById = new Map((metrics ?? []).map((m) => [m.stock_id, m]));

  const holdings: HoldingWithData[] = (stocks ?? []).map((s) => {
    const t = TEST.find((x) => x.symbol === s.symbol)!;
    const m = mById.get(s.id);
    return {
      symbol: s.symbol, name: s.name, sector: s.sector,
      quantity: t.qty, avgBuyPrice: t.avg,
      currentPrice: m?.price ?? null, beta: m?.beta ?? null,
      piotroskiScore: null, altmanZone: null, capCategory: s.cap_category,
    };
  });

  const { positions, totalValue } = positionValues(holdings);
  console.log("=== Holdings (real prices) ===");
  for (const p of positions) console.log(`  ${p.symbol}: ${p.quantity} @ ₹${p.currentPrice} = ₹${p.value?.toFixed(0)} (w=${((p.weight??0)*100).toFixed(1)}%)`);
  console.log("Total value: ₹" + totalValue.toFixed(0));

  const conc = computeConcentration(positions);
  console.log("\n=== Concentration ===");
  console.log("sector weights:", conc.sectorWeights.map(s=>`${s.sector} ${(s.weight*100).toFixed(0)}%`).join(", "));
  console.log("HHI:", conc.hhi.toFixed(3), "| flags:", conc.flags.length ? conc.flags.join("; ") : "none");

  const beta = computePortfolioBeta(positions, new Map(holdings.map(h=>[h.symbol,h.beta])));
  console.log("\n=== Beta ===", beta.beta, `(covers ${(beta.coveredWeight*100).toFixed(0)}% — null betas expected until benchmark re-fetch)`);

  // Inline 1y daily log-returns per symbol (mirrors getReturnsForSymbols without
  // the server-only import).
  const returns = new Map<string, Map<string, number>>();
  const since1y = new Date(); since1y.setFullYear(since1y.getFullYear()-1);
  const sinceStr = since1y.toISOString().slice(0,10);
  for (const s of stocks ?? []) {
    const { data: bars } = await db.from("price_history")
      .select("date, close").eq("stock_id", s.id).gte("date", sinceStr)
      .order("date", { ascending: true });
    const rows = (bars ?? []).filter(b => b.close != null);
    const map = new Map<string, number>();
    for (let i=1;i<rows.length;i++){ const prev=rows[i-1].close as number, cur=rows[i].close as number; if(prev>0&&cur>0) map.set(rows[i].date, Math.log(cur/prev)); }
    returns.set(s.symbol, map);
  }
  const wBySym = new Map(positions.filter(p=>p.weight!=null).map(p=>[p.symbol,p.weight as number]));
  const vol = computePortfolioVolatility(wBySym, returns);
  console.log("\n=== Volatility (real 1y returns) ===", vol.volatility!=null? (vol.volatility*100).toFixed(1)+"% (overlap "+vol.overlapDays+"d)" : "null ("+vol.reason+")");

  const corr = computeCorrelationMatrix(positions.filter(p=>p.weight!=null).map(p=>p.symbol), returns);
  console.log("avg correlation:", corr.averageCorrelation?.toFixed(2));

  console.log("\n=== Scenario: market_decline -10% ===");
  const sc = runScenario(positions, new Map(holdings.map(h=>[h.symbol,h.beta])), { type:"market_decline", marketShockPct:-10 });
  console.log("total impact: ₹"+sc.totalImpactValue.toFixed(0), `(${sc.totalImpactPct.toFixed(1)}%)`);
  console.log("per-holding assumed(beta=1):", sc.perHolding.filter(h=>h.assumed).map(h=>h.symbol).join(",") || "none");
}
main().catch((e)=>{console.error(e);process.exit(1);});
