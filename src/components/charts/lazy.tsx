"use client";

/**
 * Lazy-loaded chart wrappers. The chart libraries (lightweight-charts,
 * recharts) are heavy and client-only, so we load them with next/dynamic
 * (ssr: false) and show a skeleton while the chunk loads. This keeps them out
 * of the initial bundle of the (server-rendered) stock and portfolio pages.
 */

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

/** Fixed-height skeleton placeholder matching a chart's footprint. */
function ChartSkeleton({ height = "h-64" }: { height?: string }) {
  return <Skeleton className={`w-full ${height}`} aria-label="Loading chart" />;
}

export const PriceChart = dynamic(
  () => import("@/components/price-chart").then((m) => m.PriceChart),
  { ssr: false, loading: () => <ChartSkeleton height="h-[320px]" /> },
);

export const FinancialsChart = dynamic(
  () => import("@/components/financials-chart").then((m) => m.FinancialsChart),
  { ssr: false, loading: () => <ChartSkeleton height="h-72" /> },
);

export const ShareholdingChart = dynamic(
  () => import("@/components/shareholding-chart").then((m) => m.ShareholdingChart),
  { ssr: false, loading: () => <ChartSkeleton height="h-64" /> },
);

export const ConcentrationChart = dynamic(
  () =>
    import("@/components/portfolio/concentration-chart").then(
      (m) => m.ConcentrationChart,
    ),
  { ssr: false, loading: () => <ChartSkeleton height="h-64" /> },
);
