import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getCommunityProfile } from "@/lib/community/profile";
import { getPostsByAuthor } from "@/lib/community/queries";
import { FollowButton } from "@/components/community/follow-button";
import { PostCard } from "@/components/community/post-card";

export const dynamic = "force-dynamic";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  const profile = await getCommunityProfile(id, user?.id ?? null);
  if (!profile) notFound();

  const posts = await getPostsByAuthor(id, user?.id ?? null);

  return (
    <div className="container py-6">
      <div className="mx-auto max-w-2xl">
        <Link href="/community" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to feed
        </Link>

        <div className="rounded-xl border border-border bg-surface/40 p-5">
          <div className="flex items-start gap-4">
            {profile.avatarUrl ? (
              <Image src={profile.avatarUrl} alt="" width={64} height={64} className="rounded-full" />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-xl font-medium">
                {profile.name.charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h1 className="truncate text-xl font-bold">{profile.name}</h1>
                {!profile.isSelf ? (
                  <FollowButton followeeId={profile.id} initialFollowing={profile.viewerFollows} signedIn={!!user} />
                ) : null}
              </div>
              <div className="mt-2 flex gap-4 text-sm text-muted-foreground">
                <span><span className="font-semibold text-foreground">{profile.postCount}</span> posts</span>
                <span><span className="font-semibold text-foreground">{profile.followerCount}</span> followers</span>
                <span><span className="font-semibold text-foreground">{profile.followingCount}</span> following</span>
              </div>
            </div>
          </div>

          {profile.followedStocks.length > 0 ? (
            <div className="mt-4">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Follows stocks</p>
              <div className="flex flex-wrap gap-1.5">
                {profile.followedStocks.map((s) => (
                  <Link key={s} href={`/community/stock/${s}`} className="rounded-md bg-muted px-2 py-0.5 text-xs text-primary hover:bg-accent">
                    ${s}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-border">
          {posts.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">No posts yet.</p>
          ) : (
            posts.map((p) => <PostCard key={p.id} post={p} signedIn={!!user} viewerId={user?.id ?? null} />)
          )}
        </div>
      </div>
    </div>
  );
}
