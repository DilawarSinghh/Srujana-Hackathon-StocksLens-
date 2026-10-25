"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { ComposerDialog, type PortfolioOption } from "@/components/community/composer-dialog";
import { cn } from "@/lib/utils";

/**
 * Floating "Create post" action. Fixed to the bottom-right of the Community
 * page, above the feed and clear of pagination. For signed-out users it links
 * to the sign-in flow (never a broken dialog). For signed-in users it opens the
 * dedicated composer dialog, which occupies no permanent space when closed.
 *
 * Honors mobile safe-area insets via env(safe-area-inset-*).
 */
export function CreatePostFab({
  signedIn,
  userName,
  userAvatar,
  portfolios,
}: {
  signedIn: boolean;
  userName: string;
  userAvatar: string | null;
  portfolios: PortfolioOption[];
}) {
  const [open, setOpen] = React.useState(false);

  const fabClass = cn(
    "fixed right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full",
    "bg-primary text-primary-foreground shadow-lg transition-transform",
    "hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  );
  // Keep clear of the mobile browser chrome / home indicator.
  const fabStyle: React.CSSProperties = {
    bottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))",
  };

  if (!signedIn) {
    return (
      <a
        href="/login?next=/community"
        aria-label="Sign in to create a post"
        className={fabClass}
        style={fabStyle}
      >
        <Plus className="h-6 w-6" aria-hidden="true" />
      </a>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Create post"
        aria-haspopup="dialog"
        className={fabClass}
        style={fabStyle}
      >
        <Plus className="h-6 w-6" aria-hidden="true" />
      </button>
      <ComposerDialog
        open={open}
        onOpenChange={setOpen}
        userName={userName}
        userAvatar={userAvatar}
        portfolios={portfolios}
      />
    </>
  );
}
