"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { loadSamplePortfolio } from "@/app/portfolio/actions";
import { Button } from "@/components/ui/button";

/** Fills a demo portfolio from seeded stocks for an instant walkthrough. */
export function SamplePortfolioButton() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const res = await loadSamplePortfolio();
    if (res.ok) {
      router.refresh();
    } else {
      setError(res.error ?? "Could not load the sample portfolio.");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <Button onClick={load} disabled={loading} className="gap-2">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        Load sample portfolio
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-weak">
          {error}
        </p>
      ) : null}
    </div>
  );
}
