import type { CapCategory } from "@/types/database";

/**
 * Demo research universe — 15 NSE stocks chosen for SECTOR DIVERSITY, not as
 * recommendations. This is an educational tool; inclusion here is NOT advice to
 * buy, sell, or hold any security.
 *
 * yahoo_symbol = symbol + ".NS" (NSE). exchange = "NSE".
 */
export interface UniverseEntry {
  symbol: string;
  name: string;
  sector: string;
  cap_category: CapCategory;
}

export const UNIVERSE: UniverseEntry[] = [
  { symbol: "RELIANCE", name: "Reliance Industries Ltd", sector: "Energy", cap_category: "large" },
  { symbol: "TCS", name: "Tata Consultancy Services Ltd", sector: "Information Technology", cap_category: "large" },
  { symbol: "INFY", name: "Infosys Ltd", sector: "Information Technology", cap_category: "large" },
  { symbol: "HDFCBANK", name: "HDFC Bank Ltd", sector: "Banking", cap_category: "large" },
  { symbol: "ICICIBANK", name: "ICICI Bank Ltd", sector: "Banking", cap_category: "large" },
  { symbol: "SBIN", name: "State Bank of India", sector: "Banking", cap_category: "large" },
  { symbol: "ITC", name: "ITC Ltd", sector: "FMCG", cap_category: "large" },
  { symbol: "HINDUNILVR", name: "Hindustan Unilever Ltd", sector: "FMCG", cap_category: "large" },
  { symbol: "LT", name: "Larsen & Toubro Ltd", sector: "Construction", cap_category: "large" },
  { symbol: "BHARTIARTL", name: "Bharti Airtel Ltd", sector: "Telecom", cap_category: "large" },
  { symbol: "ASIANPAINT", name: "Asian Paints Ltd", sector: "Consumer Durables", cap_category: "large" },
  { symbol: "MARUTI", name: "Maruti Suzuki India Ltd", sector: "Automobile", cap_category: "large" },
  { symbol: "SUNPHARMA", name: "Sun Pharmaceutical Industries Ltd", sector: "Pharmaceuticals", cap_category: "large" },
  { symbol: "TITAN", name: "Titan Company Ltd", sector: "Consumer Durables", cap_category: "large" },
  { symbol: "BAJFINANCE", name: "Bajaj Finance Ltd", sector: "NBFC", cap_category: "large" },
];

/** Yahoo Finance symbol for an NSE ticker. */
export function toYahooSymbol(symbol: string): string {
  return `${symbol}.NS`;
}

/** NSE benchmark index (Nifty 50) used for beta. */
export const BENCHMARK_YAHOO_SYMBOL = "^NSEI";
