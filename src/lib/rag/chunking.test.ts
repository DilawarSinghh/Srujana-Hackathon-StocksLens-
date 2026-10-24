import { describe, it, expect } from "vitest";
import {
  estimateTokens,
  detectSection,
  chunkPages,
  looksLikeTable,
  buildEmbedText,
  type Page,
} from "./chunking";

describe("estimateTokens", () => {
  it("~4 chars per token", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("a".repeat(400))).toBe(100);
  });
});

describe("detectSection", () => {
  it("detects known headings", () => {
    expect(detectSection("MANAGEMENT DISCUSSION AND ANALYSIS\nThe year...")).toBe(
      "Management Discussion and Analysis",
    );
    expect(detectSection("Independent Auditor's Report to the members")).toBe(
      "Independent Auditor's Report",
    );
    expect(detectSection("Notes to the Consolidated Financial Statements")).toBe(
      "Notes to Financial Statements",
    );
    expect(detectSection("Report on Corporate Governance")).toBe(
      "Corporate Governance",
    );
  });
  it("returns null when no known heading", () => {
    expect(detectSection("Just some random paragraph about the weather.")).toBeNull();
  });
  it("only inspects the top of the page", () => {
    const text = "intro ".repeat(100) + "Balance Sheet";
    expect(detectSection(text)).toBeNull();
  });
});

describe("looksLikeTable", () => {
  it("flags number-heavy text", () => {
    expect(
      looksLikeTable("Revenue 12,345 6,789 1,011 2,022 3,033 4,044 5,055 6,066 7,077 8,088 9,099 1,010"),
    ).toBe(true);
  });
  it("does not flag prose", () => {
    expect(
      looksLikeTable(
        "The company continued to focus on sustainable growth across its core businesses during the year.",
      ),
    ).toBe(false);
  });
});

describe("chunkPages", () => {
  it("skips near-empty pages", () => {
    const pages: Page[] = [
      { pageNumber: 1, text: "short" },
      { pageNumber: 2, text: "word ".repeat(200) },
    ];
    const chunks = chunkPages(pages);
    expect(chunks.every((c) => c.pageNumber === 2)).toBe(true);
  });

  it("keeps true page numbers and never crosses pages", () => {
    const pages: Page[] = [
      { pageNumber: 5, text: "alpha ".repeat(500) },
      { pageNumber: 6, text: "beta ".repeat(500) },
    ];
    const chunks = chunkPages(pages);
    const p5 = chunks.filter((c) => c.pageNumber === 5);
    const p6 = chunks.filter((c) => c.pageNumber === 6);
    expect(p5.length).toBeGreaterThan(0);
    expect(p6.length).toBeGreaterThan(0);
    // No chunk mixes pages (enforced by construction).
    expect(p5.every((c) => c.content.includes("alpha"))).toBe(true);
    expect(p6.every((c) => c.content.includes("beta"))).toBe(true);
  });

  it("carries the last detected section forward", () => {
    const pages: Page[] = [
      { pageNumber: 1, text: "MANAGEMENT DISCUSSION AND ANALYSIS " + "text ".repeat(100) },
      { pageNumber: 2, text: "continuation " + "more ".repeat(100) },
    ];
    const chunks = chunkPages(pages);
    expect(chunks.every((c) => c.section === "Management Discussion and Analysis")).toBe(true);
  });

  it("produces overlapping windows for long pages", () => {
    const pages: Page[] = [{ pageNumber: 1, text: "sentence. ".repeat(600) }];
    const chunks = chunkPages(pages, 200, 50);
    expect(chunks.length).toBeGreaterThan(1);
    // Each chunk is roughly within the target size.
    for (const c of chunks) expect(c.tokenCount).toBeLessThanOrEqual(260);
  });

  it("sets hasTable for number-heavy chunks", () => {
    const pages: Page[] = [
      { pageNumber: 1, text: "Particulars 2025 2024 Revenue 12,345 11,234 Profit 3,456 2,345 Assets 45,678 43,210 Equity 23,456 21,098 Debt 9,876 8,765" },
    ];
    const chunks = chunkPages(pages);
    expect(chunks.some((c) => c.hasTable)).toBe(true);
  });
});

describe("buildEmbedText", () => {
  it("prepends a context header", () => {
    const t = buildEmbedText({
      company: "Acme Ltd",
      docType: "annual_report",
      fiscalYear: 2025,
      section: "Risk Management",
      pageNumber: 42,
      content: "Risk factors include...",
    });
    expect(t.startsWith("[Acme Ltd | annual_report | FY2025 | Risk Management | Page 42]")).toBe(true);
    expect(t).toContain("Risk factors include...");
  });
  it("uses General when section is null", () => {
    const t = buildEmbedText({
      company: "Acme",
      docType: "ar",
      fiscalYear: 2024,
      section: null,
      pageNumber: 1,
      content: "x",
    });
    expect(t).toContain("| General | Page 1]");
  });
});
