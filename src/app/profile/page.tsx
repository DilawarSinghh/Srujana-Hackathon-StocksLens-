import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  Mail,
  BadgeCheck,
  ShieldCheck,
  Crown,
  Wallet,
  MessageSquare,
  FileText,
  Star,
  ArrowRight,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getProfileAccount } from "@/lib/profile/account";
import { PageContainer } from "@/components/shell/page-container";
import { PageHeader } from "@/components/shell/page-header";
import { EditProfileForm } from "@/components/profile/edit-profile-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Profile",
  description: "Your StockLens account, activity, and preferences.",
};

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/profile");

  const account = await getProfileAccount(user);
  const initial = account.fullName ?? account.email ?? "Investor";

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader
        title="Profile"
        description="View and manage your StockLens account, activity, and preferences."
      />

      {/* Header card */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          {account.avatarUrl ? (
            <Image
              src={account.avatarUrl}
              alt=""
              width={72}
              height={72}
              className="rounded-full"
            />
          ) : (
            <span className="flex h-18 w-18 items-center justify-center rounded-full bg-muted text-2xl font-semibold"
              style={{ height: 72, width: 72 }}>
              {initial.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-bold">
              {account.fullName ?? "Investor"}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {account.username ? <span>@{account.username}</span> : null}
              <span className="inline-flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                {account.email ?? "No email"}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {account.role.isAdmin ? (
                <Badge className="gap-1 font-normal">
                  <Crown className="h-3 w-3" aria-hidden="true" /> Community super-admin
                </Badge>
              ) : account.role.isModerator ? (
                <Badge variant="secondary" className="gap-1 font-normal">
                  <ShieldCheck className="h-3 w-3" aria-hidden="true" /> Community moderator
                </Badge>
              ) : (
                <Badge variant="outline" className="font-normal">
                  Member
                </Badge>
              )}
              {account.emailVerified ? (
                <Badge variant="outline" className="gap-1 font-normal">
                  <BadgeCheck className="h-3 w-3 text-emerald-500" aria-hidden="true" /> Verified
                </Badge>
              ) : null}
            </div>
          </div>
          {account.role.isAdmin ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/community/admin">
                Admin console
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Account & security */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account &amp; security</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <Row label="Email" value={account.email ?? "Not available"} />
            <Row
              label="Email verified"
              value={account.emailVerified ? "Yes" : "No"}
            />
            <Row
              label="Sign-in method"
              value={account.provider ? titleCase(account.provider) : "Not available"}
            />
            <Row
              label="Community role"
              value={
                account.role.isAdmin
                  ? "Super-admin"
                  : account.role.isModerator
                    ? "Moderator"
                    : "Member"
              }
            />
            <Row
              label="Joined"
              value={
                account.createdAt
                  ? new Date(account.createdAt).toLocaleDateString()
                  : "Not available"
              }
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Your email and role are managed securely and can&apos;t be changed
              from this form.
            </p>
          </CardContent>
        </Card>

        {/* Activity (real data only) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your StockLens activity</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Stat icon={Wallet} label="Portfolios" value={account.activity.portfolioCount} hint={`${account.activity.holdingsCount} holdings`} href="/portfolio" />
            <Stat icon={Star} label="Watchlist" value={account.activity.watchlistCount} href="/community" />
            <Stat icon={MessageSquare} label="Posts" value={account.activity.postCount} href={`/community/profile/${account.id}`} />
            <Stat icon={MessageSquare} label="Comments" value={account.activity.commentCount} />
            <Stat icon={FileText} label="Documents" value={account.activity.documentCount} href="/documents" />
          </CardContent>
        </Card>
      </div>

      {account.activity.followedStocks.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Followed stocks</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {account.activity.followedStocks.map((s) => (
              <Link
                key={s}
                href={`/community/stock/${s}`}
                className="rounded-md bg-muted px-2 py-0.5 text-xs text-primary hover:bg-accent"
              >
                ${s}
              </Link>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {/* Edit preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Edit profile</CardTitle>
        </CardHeader>
        <CardContent>
          <EditProfileForm
            initial={{
              fullName: account.fullName,
              username: account.username,
              bio: account.bio,
            }}
          />
        </CardContent>
      </Card>
    </PageContainer>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate text-right font-medium">{value}</span>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  href,
}: {
  icon: typeof Wallet;
  label: string;
  value: number;
  hint?: string;
  href?: string;
}) {
  const inner = (
    <div className="rounded-lg border border-border bg-background/60 p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </div>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block transition-colors hover:opacity-90">
      {inner}
    </Link>
  ) : (
    inner
  );
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
