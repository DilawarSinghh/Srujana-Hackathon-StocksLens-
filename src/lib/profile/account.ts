import "server-only";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Load the signed-in user's OWN profile + real activity for the dashboard
 * Profile page. Everything is owner-scoped via the user's session (RLS), so
 * this can never read another user's private data. Never returns secrets.
 */

export interface ProfileAccount {
  id: string;
  email: string | null;
  fullName: string | null;
  username: string | null;
  bio: string | null;
  avatarUrl: string | null;
  createdAt: string | null;
  provider: string | null;
  emailVerified: boolean;
  role: {
    isAdmin: boolean;
    isModerator: boolean;
  };
  activity: {
    portfolioCount: number;
    holdingsCount: number;
    postCount: number;
    commentCount: number;
    documentCount: number;
    watchlistCount: number;
    followedStocks: string[];
  };
}

export async function getProfileAccount(user: User): Promise<ProfileAccount> {
  const supabase = await createClient();

  const [
    profileRes,
    adminRes,
    modRes,
    portfoliosRes,
    postsRes,
    commentsRes,
    docsRes,
    stockFollowsRes,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, username, bio, avatar_url, created_at")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("community_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
    supabase.from("community_moderators").select("user_id").eq("user_id", user.id).maybeSingle(),
    supabase.from("portfolios").select("id").eq("user_id", user.id),
    supabase
      .from("community_posts")
      .select("id", { count: "exact", head: true })
      .eq("author_id", user.id)
      .is("deleted_at", null),
    supabase
      .from("community_comments")
      .select("id", { count: "exact", head: true })
      .eq("author_id", user.id)
      .is("deleted_at", null),
    supabase
      .from("user_documents")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("community_stock_follows")
      .select("stocks(symbol)")
      .eq("user_id", user.id)
      .limit(30),
  ]);

  const profile = profileRes.data;

  // Holdings across all of the user's portfolios (owner-scoped through the
  // portfolio ids we just loaded; RLS also enforces ownership).
  const portfolioIds = (portfoliosRes.data ?? []).map((p) => p.id);
  let holdingsCount = 0;
  if (portfolioIds.length > 0) {
    const { count } = await supabase
      .from("holdings")
      .select("id", { count: "exact", head: true })
      .in("portfolio_id", portfolioIds);
    holdingsCount = count ?? 0;
  }

  const followedStocks = (stockFollowsRes.data ?? [])
    .map((r) => (r as unknown as { stocks: { symbol: string } | null }).stocks?.symbol)
    .filter((s): s is string => !!s);

  // Auth provider + verification come from the trusted session, never a form.
  const provider =
    user.app_metadata?.provider ??
    (Array.isArray(user.app_metadata?.providers)
      ? (user.app_metadata?.providers as string[])[0]
      : null) ??
    null;
  const emailVerified =
    Boolean((user as { email_confirmed_at?: string }).email_confirmed_at) ||
    Boolean((user.user_metadata as { email_verified?: boolean })?.email_verified);

  return {
    id: user.id,
    email: user.email ?? null,
    fullName: profile?.full_name ?? null,
    username: profile?.username ?? null,
    bio: profile?.bio ?? null,
    avatarUrl: profile?.avatar_url ?? null,
    createdAt: profile?.created_at ?? user.created_at ?? null,
    provider,
    emailVerified,
    role: {
      isAdmin: Boolean(adminRes.data),
      isModerator: Boolean(modRes.data) || Boolean(adminRes.data),
    },
    activity: {
      portfolioCount: portfolioIds.length,
      holdingsCount,
      postCount: postsRes.count ?? 0,
      commentCount: commentsRes.count ?? 0,
      documentCount: docsRes.count ?? 0,
      watchlistCount: followedStocks.length,
      followedStocks,
    },
  };
}
