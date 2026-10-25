import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Disclaimer } from "@/components/disclaimer";
import { DebateArena } from "@/components/debate/debate-arena";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI Debate — Devil's Advocate",
  description:
    "Three AI agents debate the investment thesis for an Indian stock: a Bull case, a Devil's Advocate challenge, and an independent Judge's verdict — grounded in StockLens data. Educational, not investment advice.",
};

export default async function DebatePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/debate");

  return (
    <div className="container flex max-w-6xl flex-col gap-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">
          Devil&apos;s Advocate — AI Investment Debate
        </h1>
        <p className="max-w-3xl text-muted-foreground">
          Pick an NSE/BSE stock supported by StockLens and watch three agents
          argue the evidence: a <strong>Bull</strong> builds the strongest
          evidence-supported case, a <strong>Devil&apos;s Advocate</strong>{" "}
          stress-tests it, and an independent <strong>Judge</strong> weighs both
          sides. Every point is grounded in available StockLens data and filings
          — nothing is invented.
        </p>
        <Disclaimer />
      </header>

      <DebateArena />
    </div>
  );
}
