import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { Disclaimer } from "@/components/disclaimer";
import { LandingSections } from "@/components/landing/landing-sections";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";

// Reads the session to redirect signed-in users to the dashboard.
export const dynamic = "force-dynamic";

/**
 * Public landing page — shown to signed-out visitors only. Signed-in users are
 * redirected to the authenticated dashboard. All stock discovery lives in the
 * Stock Explorer (/stocks), not here.
 */
export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <TooltipProvider delayDuration={200}>
      {/* Hero */}
      <section className="hero-glow border-b border-border">
        <div className="container flex flex-col items-center gap-5 py-14 text-center sm:py-20">
          <span className="rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
            Educational research for Indian (NSE/BSE) investors
          </span>
          <h1 className="max-w-3xl text-3xl font-bold tracking-tight sm:text-5xl">
            {siteConfig.tagline}
          </h1>
          <p className="max-w-2xl text-balance text-muted-foreground sm:text-lg">
            Transparent fundamental scores, filings-grounded answers, and
            portfolio risk tools — every number traceable to a source or a
            documented calculation.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/login?next=/stocks">Get started</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="#features-heading">Explore features</Link>
            </Button>
          </div>
          <Disclaimer className="max-w-xl" />
        </div>
      </section>

      <div className="container flex flex-col gap-12 py-12">
        {/* Explanatory sections (presentational, no live figures) */}
        <LandingSections />

        {/* Closing call to action */}
        <section className="flex flex-col items-center gap-4 rounded-lg border border-border bg-muted/30 px-6 py-10 text-center">
          <h2 className="text-xl font-semibold">Ready to start researching?</h2>
          <p className="max-w-xl text-sm text-muted-foreground">
            Sign in to browse fundamental scores in the Stock Explorer, chat with
            official filings, and build a portfolio with risk tools.
          </p>
          <Button asChild size="lg">
            <Link href="/login?next=/stocks">Sign in with Google</Link>
          </Button>
          <Disclaimer variant="compact" className="max-w-xl" />
        </section>
      </div>
    </TooltipProvider>
  );
}
