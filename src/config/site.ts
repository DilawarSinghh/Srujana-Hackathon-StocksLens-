/** Static site configuration. */
export const siteConfig = {
  name: "StockLens",
  tagline: "Research stocks through their official filings",
  description:
    "Educational stock research for Indian retail investors. Transparent fundamental scores, filings-grounded AI, and portfolio risk tools. Not investment advice.",
  nav: [
    { title: "Home", href: "/" },
    { title: "Portfolio", href: "/portfolio" },
    { title: "Methodology", href: "/methodology" },
  ],
} as const;

export type SiteConfig = typeof siteConfig;
