import { Disclaimer } from "@/components/disclaimer";
import { DataFreshness } from "@/components/data-freshness";

interface StockPageProps {
  params: Promise<{ symbol: string }>;
}

export default async function StockPage({ params }: StockPageProps) {
  const { symbol } = await params;
  const upper = decodeURIComponent(symbol).toUpperCase();

  return (
    <div className="container flex flex-col gap-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{upper}</h1>
        <DataFreshness lastUpdated={null} />
      </div>
      <p className="text-muted-foreground">
        Stock detail page scaffold. Chart, ratios, score breakdown, red flags,
        and the filings chat arrive in later phases.
      </p>
      <Disclaimer />
    </div>
  );
}
