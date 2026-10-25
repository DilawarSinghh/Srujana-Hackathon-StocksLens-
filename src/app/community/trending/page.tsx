import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getPostsByTag } from "@/lib/community/queries";
import { PostCard } from "@/components/community/post-card";

export const dynamic = "force-dynamic";

/**
 * Trending page. With no tag, it mirrors the main trending feed (redirect to
 * the tabbed view). With ?tag=, it shows posts for that hashtag.
 */
export default async function TrendingPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string }>;
}) {
  const { tag } = await searchParams;
  if (!tag) redirect("/community?tab=trending");

  const user = await getCurrentUser();
  const posts = await getPostsByTag(tag, user?.id ?? null);

  return (
    <div className="container py-6">
      <div className="mx-auto max-w-2xl">
        <Link href="/community" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to feed
        </Link>
        <h1 className="mb-4 text-2xl font-bold tracking-tight">#{tag}</h1>
        <div className="overflow-hidden rounded-xl border border-border">
          {posts.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">
              No posts with #{tag} yet.
            </p>
          ) : (
            posts.map((p) => (
              <PostCard key={p.id} post={p} signedIn={!!user} viewerId={user?.id ?? null} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
