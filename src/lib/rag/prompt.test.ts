import { describe, it, expect } from "vitest";
import {
  renderAnalysisData,
  renderSources,
  STOCK_ANALYSIS_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
  ANALYSIS_DISCLAIMER,
} from "./prompt";
import type { ChatDataBlock } from "./context";
import type { RetrievedChunk } from "./retrieve";

function block(overrides: Partial<ChatDataBlock> = {}): ChatDataBlock {
  return {
    symbol: "MARUTI",
    name: "Maruti Suzuki India Ltd",
    exchange: "NSE",
    sector: "Automobile",
    industry: "Passenger cars",
    as_of: "2026-10-24",
    metrics: { price: 11000, pe: 28.5, roe: 16.2, debt_to_equity: null },
    price_summary: {
      as_of: "2026-10-24",
      latest_close: 11000,
      first_date: "2025-10-24",
      first_close: 9800,
      change_pct: 12.2,
      points: 248,
      week52_high: 13000,
      week52_low: 9000,
    },
    fundamentals_annual: [
      { fiscal_year: 2025, net_profit: 13000, revenue: 150000 },
    ],
    score: {
      total_score: 72,
      label: "Strong fundamentals",
      data_confidence: 0.9,
      capped: false,
      formula_version: "v1.1",
      pillars: [
        { key: "profitability", label: "Profitability", weight: 25, score: 80 },
      ],
    },
    red_flags: [],
    governance: null,
    missing: ["Debt-to-equity", "Shareholding / governance data"],
    ...overrides,
  };
}

describe("renderAnalysisData", () => {
  it("includes company identity and as-of date", () => {
    const out = renderAnalysisData(block());
    expect(out).toContain("Maruti Suzuki India Ltd");
    expect(out).toContain("MARUTI");
    expect(out).toContain("2026-10-24");
  });

  it("renders a null metric as null and lists it in MISSING (never zero)", () => {
    const out = renderAnalysisData(block());
    expect(out).toContain('"debt_to_equity":null');
    expect(out).not.toContain('"debt_to_equity":0');
    expect(out).toMatch(/MISSING[^\n]*Debt-to-equity/);
  });

  it("reports (none) when nothing is missing", () => {
    const out = renderAnalysisData(block({ missing: [] }));
    expect(out).toMatch(/MISSING[^\n]*\(none\)/);
  });

  it("includes the deterministic score pillars without recomputing", () => {
    const out = renderAnalysisData(block());
    expect(out).toContain('"total_score":72');
    expect(out).toContain("Profitability");
  });
});

describe("renderSources", () => {
  it("labels chunks S1..Sn with metadata", () => {
    const chunks: RetrievedChunk[] = [
      {
        id: "c1",
        filingId: "f1",
        page: 7,
        section: "Risk Factors",
        content: "Input costs are volatile.",
        similarity: 0.8,
        filingTitle: "FY25 Annual Report",
        sourceUrl: "https://x/ar.pdf",
        docType: "annual_report",
        fiscalYear: 2025,
      },
    ];
    const out = renderSources(chunks);
    expect(out).toContain("[S1]");
    expect(out).toContain("FY2025");
    expect(out).toContain("Risk Factors");
  });

  it("returns a none marker when there are no chunks", () => {
    expect(renderSources([])).toBe("SOURCES: (none)");
  });
});

describe("system prompts", () => {
  it("analysis prompt is data-grounded and ends with the analysis disclaimer rule", () => {
    expect(STOCK_ANALYSIS_SYSTEM_PROMPT).toMatch(/STOCK ANALYSIS mode/);
    expect(STOCK_ANALYSIS_SYSTEM_PROMPT).toContain(ANALYSIS_DISCLAIMER);
    // Must forbid fabrication and recomputing the score.
    expect(STOCK_ANALYSIS_SYSTEM_PROMPT).toMatch(/never recalculate/i);
    expect(STOCK_ANALYSIS_SYSTEM_PROMPT).toMatch(/never invent/i);
  });

  it("filings prompt is distinct and document-grounded", () => {
    expect(SYSTEM_PROMPT).toMatch(/FILINGS mode/);
    expect(SYSTEM_PROMPT).not.toBe(STOCK_ANALYSIS_SYSTEM_PROMPT);
  });
});
