import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Disclaimer } from "@/components/disclaimer";

export const metadata = {
  title: "Community guidelines · StockLens",
  description: "How the StockLens Community works and what we expect from members.",
};

export default function GuidelinesPage() {
  return (
    <div className="container py-8">
      <div className="mx-auto max-w-2xl">
        <Link href="/community" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to feed
        </Link>
        <h1 className="mb-4 text-2xl font-bold tracking-tight">Community guidelines</h1>

        <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
          <p className="text-foreground">
            StockLens Community is for evidence-based discussion of stocks and investing. Posts are
            opinions from members, not verified facts and not personalized investment advice.
          </p>

          <Section title="What's encouraged">
            <ul className="list-disc space-y-1 pl-5">
              <li>Research, data, and reasoning you can point to.</li>
              <li>Clear theses with stated risks and time horizons.</li>
              <li>Constructive, specific portfolio feedback.</li>
              <li>Respectful disagreement — bullish and bearish views both belong here.</li>
            </ul>
          </Section>

          <Section title="Not allowed">
            <ul className="list-disc space-y-1 pl-5">
              <li>Claiming your opinion is an official StockLens rating.</li>
              <li>Pump-and-dump, coordinated manipulation, or guaranteed-profit claims.</li>
              <li>Deceptive performance displays or fabricated data.</li>
              <li>Harassment, hate, spam, or impersonation.</li>
            </ul>
          </Section>

          <Section title="Moderation">
            <p>
              Anyone can report a post, comment, or profile. Reports go to moderators. We don&apos;t
              remove content simply for being bullish or bearish. You can block a member to hide
              their content from your feeds. Removed content is retained for moderation review.
            </p>
          </Section>

          <Section title="StockLens scores vs community ratings">
            <p>
              Stock cards show the deterministic StockLens Fundamental Score, computed in code from
              company data. Community ratings and poll results are subjective opinions and are never
              presented as validated scores or predictions.
            </p>
          </Section>
        </div>

        <div className="mt-6">
          <Disclaimer />
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-1 font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}
