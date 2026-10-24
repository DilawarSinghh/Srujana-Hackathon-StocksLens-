import { Disclaimer } from "@/components/disclaimer";

export default function PortfolioPage() {
  return (
    <div className="container flex flex-col gap-6 py-10">
      <h1 className="text-2xl font-bold tracking-tight">My Portfolio</h1>
      <p className="text-muted-foreground">
        Portfolio scaffold. Holdings, sector concentration, beta, and the
        market-drop stress test arrive in Phase 10. Login required.
      </p>
      <Disclaimer />
    </div>
  );
}
