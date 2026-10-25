import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WebMarkdown } from "./web-markdown";
import type { ChatSource } from "@/types/database";

/**
 * Verifies that [Wn] citations render as source chips showing the domain and
 * date, link to the original URL, and open safely in a new tab.
 */

const sources: ChatSource[] = [
  {
    id: "W1",
    doc: "Reliance Q2 results",
    fiscalYear: null,
    page: null,
    section: "moneycontrol.com · 2026-10-25",
    snippet: "…",
    url: "https://moneycontrol.com/news/reliance",
  },
];

describe("WebMarkdown citation rendering", () => {
  it("renders a domain+date chip linking to the source in a new tab", () => {
    const html = renderToStaticMarkup(
      <WebMarkdown content="Revenue rose [W1]." sources={sources} />,
    );
    expect(html).toContain("moneycontrol.com · 2026-10-25");
    expect(html).toContain('href="https://moneycontrol.com/news/reliance"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("shows a plain tag when the source is missing", () => {
    const html = renderToStaticMarkup(
      <WebMarkdown content="Something [W9]." sources={sources} />,
    );
    expect(html).toContain("W9");
    expect(html).not.toContain("href=");
  });
});
