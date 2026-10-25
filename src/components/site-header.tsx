import Link from "next/link";
import { LineChart, Search } from "lucide-react";
import { siteConfig } from "@/config/site";
import { Button } from "@/components/ui/button";
import { MainNav } from "@/components/main-nav";
import { MobileNav } from "@/components/mobile-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserNav } from "@/components/user-nav";

/**
 * Global site header: logo, primary nav (with active state), a real search
 * link, theme toggle, and the auth control. A responsive drawer handles mobile.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center gap-2">
        <MobileNav />

        <Link
          href="/"
          className="flex items-center gap-2 font-semibold"
          aria-label={`${siteConfig.name} home`}
        >
          <LineChart className="h-5 w-5 text-primary" aria-hidden="true" />
          <span>{siteConfig.name}</span>
        </Link>

        <div className="ml-4 hidden md:block">
          <MainNav />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="hidden gap-2 text-muted-foreground sm:inline-flex"
          >
            <Link href="/#explore">
              <Search className="h-4 w-4" aria-hidden="true" />
              <span>Search stocks</span>
            </Link>
          </Button>

          <ThemeToggle />

          <UserNav />
        </div>
      </div>
    </header>
  );
}
