import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { listPortfolios } from "@/lib/data/portfolio";
import { CreateShareForm } from "@/components/community/create-share-form";
import { CommunityNotice } from "@/components/community/community-notice";

export const dynamic = "force-dynamic";

export default async function NewSharePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/community/portfolio/new");

  const portfolios = await listPortfolios(user.id);

  return (
    <div className="container py-6">
      <div className="mx-auto max-w-2xl">
        <Link href="/community" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to feed
        </Link>
        <h1 className="mb-1 text-2xl font-bold tracking-tight">Share a portfolio</h1>
        <p className="mb-4 text-sm text-muted-foreground">
          Create a revocable, self-contained snapshot. Your real portfolio is never exposed — only
          the fields you choose are copied into the share.
        </p>
        <div className="mb-4">
          <CommunityNotice />
        </div>
        <div className="rounded-xl border border-border bg-surface/40 p-5">
          <CreateShareForm portfolios={portfolios} signedIn={!!user} />
        </div>
      </div>
    </div>
  );
}
