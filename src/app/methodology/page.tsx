import type { Metadata } from "next";
import { Disclaimer } from "@/components/disclaimer";

export const metadata: Metadata = {
  title: "Methodology",
};

export default function MethodologyPage() {
  return (
    <div className="container flex max-w-3xl flex-col gap-6 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Methodology</h1>
      <p className="text-muted-foreground">
        Methodology scaffold. The full breakdown of pillars, weights,
        sector-percentile scoring, red-flag caps, and data sources is written in
        Phase 11.
      </p>
      <Disclaimer />
    </div>
  );
}
