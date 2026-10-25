import Link from "next/link";
import { Bookmark, Bell, Wallet, TrendingUp } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getFeed, type FeedTab } from "@/lib/community/queries";
import { getSidebarData } from "@/lib/community/sidebar";
import { Composer } from "@/components/community/composer";
import { FeedTabs } from "@/components/community/feed-tabs";
import { FeedList } from "@/components/community/feed-list";
import { CommunityNotice } from "@/components/community/community-notice";

export const dynamic = "force-dynamic";

const VALID_TABS: FeedTab[] = ["foryou", "following", "trending", "latest"];

function emptyFor(tab: FeedTab, signedIn: boolean): string {
  switch (tab) {
    case "following":
      return signedIn
        ? "You're not following anyone yet, or they haven't posted. Find investors to follow."
        : "Sign in to see posts from investors you follow.";
    case "trending":
      return "Nothing trending in the last 48 hours yet. Be the first to spark a discussion.";
    default:
      return "No posts yet. Start the conversation above.";
  }
}

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: tabParam } = await searchParams;
  const tab: FeedTab = VALID_TABS.includes(tabParam as FeedTab)
    ? (tabParam as FeedTab)
    : "foryou";

  const user = await getCurrentUser();
  const signedIn = !!user;

  const [{ posts, nextCursor }, sidebar] = await Promise.all([
    getFeed({ tab, viewerId: user?.id ?? null }),
    getSidebarData(),
  ]);

  return (
    <div className="container py-6">
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        {/* Central feed. */}
        <div className="min-w-0">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Community</h1>
            <div className="flex items-center gap-1">
              <Link
                href="/community/notifications"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
              </Link>
              <Link
                href="/community/bookmarks"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
                aria-label="Bookmarks"
              >
                <Bookmark className="h-5 w-5" />
              </Link>
            </div>
          </div>

          <div className="mb-4">
            <CommunityNotice />
          </div>

          <div className="mb-4">
            <Composer signedIn={signedIn} />
          </div>

          <div className="overflow-hidden rounded-xl border border-border">
            <FeedTabs active={tab} />
            <FeedList
              key={tab}
              tab={tab}
              initialPosts={posts}
              initialCursor={nextCursor}
              signedIn={signedIn}
              viewerId={user?.id ?? null}
              emptyMessage={emptyFor(tab, signedIn)}
            />
          </div>
        </div>

        {/* Secondary column. */}
        <aside className="hidden flex-col gap-4 lg:flex">
          <SidebarCard title="Trending stocks" icon={<TrendingUp className="h-4 w-4" />}>
            {sidebar.stocks.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nothing yet.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {sidebar.stocks.map((s) => (
                  <li key={s.symbol} className="flex items-center justify-between text-sm">
                    <Link href={`/community/stock/${s.symbol}`} className="font-medium text-primary hover:underline">
                      ${s.symbol}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {s.count} post{s.count === 1 ? "" : "s"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SidebarCard>

          <SidebarCard title="Trending tags">
            {sidebar.tags.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nothing yet.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {sidebar.tags.map((t) => (
                  <li key={t.tag}>
                    <Link
                      href={`/community/trending?tag=${encodeURIComponent(t.tag)}`}
                      className="rounded-md bg-muted px-2 py-0.5 text-xs text-primary hover:bg-accent"
                    >
                      #{t.tag}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SidebarCard>

          {signedIn ? (
            <SidebarCard title="Share a portfolio" icon={<Wallet className="h-4 w-4" />}>
              <p className="mb-2 text-xs text-muted-foreground">
                Get structured community feedback. You choose exactly what to disclose.
              </p>
              <Link href="/community/portfolio/new" className="text-sm font-medium text-primary hover:underline">
                Create a portfolio share →
              </Link>
            </SidebarCard>
          ) : null}

          <p className="px-1 text-[11px] text-muted-foreground">
            <Link href="/community/guidelines" className="hover:underline">
              Community guidelines
            </Link>
          </p>
        </aside>
      </div>
    </div>
  );
}

function SidebarCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface/40 p-4">
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        {icon}
        {title}
      </h2>
      {children}
    </div>
  );
}
