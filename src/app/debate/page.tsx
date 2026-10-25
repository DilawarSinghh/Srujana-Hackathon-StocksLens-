import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Disclaimer } from "@/components/disclaimer";
import { DebateArena } from "@/components/debate/debate-arena";
import { PageContainer } from "@/components/shell/page-container";
import { PageHeader } from "@/components/shell/page-header";

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
    <PageContainer>
      <PageHeader
        title="AI Investment Debate"
        description="Three agents argue the evidence for a stock: a Bull builds the case, a Devil's Advocate stress-tests it, and an independent Judge weighs both sides — grounded in StockLens data and filings."
      />
      <Disclaimer />
      <DebateArena />
    </PageContainer>
  );
}
