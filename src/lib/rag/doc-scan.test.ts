import { describe, it, expect, vi, beforeEach } from "vitest";

const generateWithFallback = vi.fn();
vi.mock("./model-chain", () => ({
  generateWithFallback: (...args: unknown[]) => generateWithFallback(...args),
}));

import { scanDocument, type ScanPage } from "./doc-scan";

const pages: ScanPage[] = [
  {
    pageNumber: 3,
    section: "Auditor's Report",
    content:
      "The auditor issued a qualified opinion regarding revenue recognition policies.",
  },
  { pageNumber: 10, section: "Overview", content: "The company makes widgets." },
];

beforeEach(() => generateWithFallback.mockReset());

describe("scanDocument", () => {
  it("parses a valid summary + red flags and truncates long quotes to <15 words", async () => {
    const longQuote = Array.from({ length: 30 }, (_, i) => `w${i}`).join(" ");
    generateWithFallback.mockResolvedValueOnce({
      text: JSON.stringify({
        summary: ["Covers FY24 financials.", "Includes the auditor's report."],
        red_flags: [
          {
            title: "Qualified auditor opinion",
            explanation: "The auditor flagged revenue recognition.",
            page: 3,
            short_quote: longQuote,
          },
        ],
      }),
    });
    const r = await scanDocument(pages);
    expect(r).not.toBeNull();
    expect(r?.summary).toHaveLength(2);
    expect(r?.redFlags[0].page).toBe(3);
    expect(r?.redFlags[0].short_quote.split(/\s+/).length).toBeLessThan(15);
  });

  it("returns null when the model output is not valid JSON", async () => {
    generateWithFallback.mockResolvedValueOnce({ text: "sorry, no json" });
    expect(await scanDocument(pages)).toBeNull();
  });

  it("returns null when a red flag is missing its page number", async () => {
    generateWithFallback.mockResolvedValueOnce({
      text: JSON.stringify({
        summary: ["x"],
        red_flags: [{ title: "t", explanation: "e", short_quote: "q" }],
      }),
    });
    expect(await scanDocument(pages)).toBeNull();
  });

  it("returns null on an empty page list without calling the model", async () => {
    expect(await scanDocument([])).toBeNull();
    expect(generateWithFallback).not.toHaveBeenCalled();
  });
});
