/** Static site configuration. */
export const siteConfig = {
  name: "StockLens",
  tagline: "Research stocks through their official filings",
  description:
    "Educational stock research for Indian retail investors. Transparent fundamental scores, filings-grounded AI, and portfolio risk tools. Not investment advice.",
  nav: [
    { title: "Explore", href: "/" },
    { title: "AI Debate", href: "/debate" },
    { title: "Community", href: "/community" },
    { title: "Portfolio", href: "/portfolio" },
    { title: "Documents", href: "/documents" },
    { title: "Methodology", href: "/methodology" },
  ],
} as const;

export type SiteConfig = typeof siteConfig;
