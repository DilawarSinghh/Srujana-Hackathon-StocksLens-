/**
 * Public broker websites. FilingLens links OUT to the user's own broker and
 * never handles money or places orders. These are generic homepages / login
 * pages, not order-placement deep links.
 */
export interface Broker {
  name: string;
  url: string;
}

export const BROKERS: Broker[] = [
  { name: "Groww", url: "https://groww.in" },
  { name: "Zerodha", url: "https://zerodha.com" },
  { name: "Upstox", url: "https://upstox.com" },
  { name: "Angel One", url: "https://www.angelone.in" },
];
