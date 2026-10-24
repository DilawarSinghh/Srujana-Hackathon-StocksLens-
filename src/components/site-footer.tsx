import Link from "next/link";
import { siteConfig } from "@/config/site";
import { Disclaimer } from "@/components/disclaimer";

/** Global footer with nav links and the legal disclaimer. */
export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="container flex flex-col gap-4 py-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium">{siteConfig.name}</p>
          <nav className="flex gap-4 text-sm text-muted-foreground" aria-label="Footer">
            {siteConfig.nav.map((item) => (
              <Link key={item.href} href={item.href} className="hover:text-foreground">
                {item.title}
              </Link>
            ))}
          </nav>
        </div>
        <Disclaimer />
        <p className="text-xs text-muted-foreground">
          StockLens is an educational research tool. It never handles money or
          places orders. You trade through your own broker.
        </p>
      </div>
    </footer>
  );
}
