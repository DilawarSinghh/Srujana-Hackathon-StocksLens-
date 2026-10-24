import { siteConfig } from "@/config/site";
import { Disclaimer } from "@/components/disclaimer";
import { DataFreshness } from "@/components/data-freshness";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function HomePage() {
  return (
    <div className="container flex flex-col gap-8 py-10">
      <section className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {siteConfig.tagline}
        </h1>
        <p className="max-w-2xl text-muted-foreground">{siteConfig.description}</p>
        <Disclaimer className="max-w-2xl" />
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Top-scored by fundamentals</h2>
          <DataFreshness lastUpdated={null} />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Coming soon</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Ranked stock categories, search, and the Fundamental Score land in
            later phases. This is the Phase 0 scaffold.
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
