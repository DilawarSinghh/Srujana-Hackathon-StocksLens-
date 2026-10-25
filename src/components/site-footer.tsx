import Link from "next/link";
import { LineChart } from "lucide-react";
import { siteConfig } from "@/config/site";
import { Disclaimer } from "@/components/disclaimer";

/** Global footer with grouped nav links and the legal disclaimer. */
export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface/40">
      <div className="container flex flex-col gap-8 py-10">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <p className="flex items-center gap-2 font-semibold">
              <LineChart className="h-5 w-5 text-primary" aria-hidden="true" />
              {siteConfig.name}
            </p>
            <p className="max-w-xs text-sm text-muted-foreground">
              {siteConfig.description}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Product</p>
            <nav
              className="flex flex-col gap-1.5 text-sm text-muted-foreground"
              aria-label="Footer product"
            >
              {siteConfig.nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="w-fit hover:text-foreground"
                >
                  {item.title}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Transparency</p>
            <nav
              className="flex flex-col gap-1.5 text-sm text-muted-foreground"
              aria-label="Footer transparency"
            >
              <Link href="/methodology" className="w-fit hover:text-foreground">
                Methodology &amp; data sources
              </Link>
            </nav>
            <p className="mt-1 text-xs text-muted-foreground">
              Formal Privacy Policy and Terms of Use are pending legal review and
              are not yet published.
            </p>
          </div>
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
