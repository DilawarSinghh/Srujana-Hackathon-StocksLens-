import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getPostDetail } from "@/lib/community/queries";
import { PostCard } from "@/components/community/post-card";
import { CommentThread } from "@/components/community/comment-thread";
import { CommunityNotice } from "@/components/community/community-notice";

export const dynamic = "force-dynamic";

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  const detail = await getPostDetail(id, user?.id ?? null);
  if (!detail) notFound();

  return (
    <div className="container py-6">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/community"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to feed
        </Link>

        <div className="mb-4">
          <CommunityNotice />
        </div>

        <div className="overflow-hidden rounded-xl border border-border">
          <PostCard post={detail.post} signedIn={!!user} viewerId={user?.id ?? null} />
          <CommentThread
            postId={detail.post.id}
            comments={detail.comments}
            signedIn={!!user}
            viewerId={user?.id ?? null}
          />
        </div>
      </div>
    </div>
  );
}
