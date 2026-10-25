"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { LogOut, User as UserIcon, Settings } from "lucide-react";
import { useUser } from "@/hooks/use-user";
import { createClient } from "@/lib/supabase/client";
import { getDisplayName, getAvatarUrl } from "@/lib/user";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Bottom-of-sidebar account control with a sign-out action. */
export function SidebarUser({ collapsed }: { collapsed: boolean }) {
  const { user, loading } = useUser();
  const router = useRouter();
  const [signingOut, setSigningOut] = React.useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  if (loading) {
    return <Skeleton className={cn("h-10", collapsed ? "w-10 mx-auto" : "w-full")} />;
  }

  if (!user) {
    return (
      <Button asChild variant="outline" size="sm" className="w-full">
        <Link href="/login">{collapsed ? <UserIcon className="h-4 w-4" /> : "Sign in"}</Link>
      </Button>
    );
  }

  const name = getDisplayName(user);
  const avatar = getAvatarUrl(user);
  const Avatar = avatar ? (
    <Image src={avatar} alt="" width={28} height={28} className="rounded-full" />
  ) : (
    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted">
      <UserIcon className="h-4 w-4" aria-hidden="true" />
    </span>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "h-auto w-full gap-2 py-2",
            collapsed ? "justify-center px-0" : "justify-start",
          )}
          aria-label="Account menu"
        >
          {Avatar}
          {!collapsed ? (
            <span className="min-w-0 flex-1 truncate text-left text-sm">{name}</span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-52">
        <DropdownMenuLabel className="truncate">{name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/community">
            <Settings className="mr-2 h-4 w-4" aria-hidden="true" />
            Community profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleSignOut}
          disabled={signingOut}
          className="text-destructive focus:text-destructive"
        >
          <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
          {signingOut ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
