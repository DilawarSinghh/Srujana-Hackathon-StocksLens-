"use client";

import { Menu } from "lucide-react";
import { useSidebar } from "@/components/shell/sidebar-context";
import { SearchBar } from "@/components/search-bar";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

/**
 * Topbar inside the app shell: a mobile menu trigger, the global stock search,
 * and the theme toggle. The per-page title/description lives in PageHeader, not
 * here, to avoid crowding the global bar.
 */
export function AppTopbar() {
  const { setMobileOpen } = useSidebar();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Open navigation"
        onClick={() => setMobileOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="flex-1">
        <div className="max-w-md">
          <SearchBar placeholder="Search stocks…" />
        </div>
      </div>

      <ThemeToggle />
    </header>
  );
}
