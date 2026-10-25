import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getBookmarkedPosts } from "@/lib/community/queries";
import { PostCard } from "@/components/community/post-card";

export const dynamic = "force-dynamic";

export default async function BookmarksPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/community/bookmarks");

  const posts = await getBookmarkedPosts(user.id);

  return (
    <div className="container py-6">
      <div className="mx-auto max-w-2xl">
        <Link href="/community" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to feed
        </Link>
        <h1 className="mb-1 text-2xl font-bold tracking-tight">Bookmarks</h1>
        <p className="mb-4 text-sm text-muted-foreground">Private to you.</p>
        <div className="overflow-hidden rounded-xl border border-border">
          {posts.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">
              No bookmarks yet. Tap the bookmark icon on any post to save it here.
            </p>
          ) : (
            posts.map((p) => <PostCard key={p.id} post={p} signedIn viewerId={user.id} />)
          )}
        </div>
      </div>
    </div>
  );
}
