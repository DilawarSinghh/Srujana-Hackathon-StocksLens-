import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface CommunityProfile {
  id: string;
  name: string;
  avatarUrl: string | null;
  bio: string | null; // profiles has no bio column yet; always null for now
  followerCount: number;
  followingCount: number;
  postCount: number;
  viewerFollows: boolean;
  isSelf: boolean;
  followedStocks: string[];
}

/** Load a public community profile. Never exposes email/auth identifiers. */
export async function getCommunityProfile(
  profileId: string,
  viewerId: string | null,
): Promise<CommunityProfile | null> {
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url")
    .eq("id", profileId)
    .maybeSingle();
  if (!profile) return null;

  const [followers, following, posts, viewerFollow, stockFollows] = await Promise.all([
    supabase.from("community_follows").select("follower_id", { count: "exact", head: true }).eq("followee_id", profileId),
    supabase.from("community_follows").select("followee_id", { count: "exact", head: true }).eq("follower_id", profileId),
    supabase.from("community_posts").select("id", { count: "exact", head: true }).eq("author_id", profileId).is("deleted_at", null),
    viewerId
      ? supabase.from("community_follows").select("followee_id").eq("follower_id", viewerId).eq("followee_id", profileId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("community_stock_follows").select("stocks(symbol)").eq("user_id", profileId).limit(20),
  ]);

  return {
    id: profile.id,
    name: profile.full_name ?? "Investor",
    avatarUrl: profile.avatar_url,
    bio: null,
    followerCount: followers.count ?? 0,
    followingCount: following.count ?? 0,
    postCount: posts.count ?? 0,
    viewerFollows: !!viewerFollow.data,
    isSelf: viewerId === profileId,
    followedStocks: (stockFollows.data ?? [])
      .map((r) => (r as unknown as { stocks: { symbol: string } | null }).stocks?.symbol)
      .filter((s): s is string => !!s),
  };
}
