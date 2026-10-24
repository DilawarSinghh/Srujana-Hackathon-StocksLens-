import Link from "next/link";
import { LineChart, Search } from "lucide-react";
import { siteConfig } from "@/config/site";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserNav } from "@/components/user-nav";

/**
 * Global site header: logo, nav, search placeholder, login placeholder,
 * theme toggle. Search and auth are wired up in later phases.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center gap-4">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold"
          aria-label={`${siteConfig.name} home`}
        >
          <LineChart className="h-5 w-5 text-primary" aria-hidden="true" />
          <span>{siteConfig.name}</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {siteConfig.nav.map((item) => (
            <Button key={item.href} asChild variant="ghost" size="sm">
              <Link href={item.href}>{item.title}</Link>
            </Button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {/* Search placeholder — real autocomplete lands in Phase 5. */}
          <div
            className="hidden items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground sm:flex"
            aria-hidden="true"
          >
            <Search className="h-4 w-4" />
            <span>Search stocks…</span>
          </div>

          <ThemeToggle />

          <UserNav />
        </div>
      </div>
    </header>
  );
}
