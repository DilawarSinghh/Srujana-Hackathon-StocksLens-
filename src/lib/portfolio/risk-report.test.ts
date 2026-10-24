import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture all text written to the PDF so we can assert on content, and stub
// jsPDF so no real document/save is needed.
const textCalls: string[] = [];
const saved: string[] = [];

vi.mock("jspdf", () => {
  class FakeDoc {
    internal = {
      pageSize: { getWidth: () => 210, getHeight: () => 297 },
    };
    setFont() {}
    setFontSize() {}
    setTextColor() {}
    setDrawColor() {}
    setFillColor() {}
    rect() {}
    addPage() {}
    splitTextToSize(text: string) {
      return Array.isArray(text) ? text : [text];
    }
    text(t: string | string[]) {
      if (Array.isArray(t)) textCalls.push(...t);
      else textCalls.push(t);
    }
    save(name: string) {
      saved.push(name);
    }
  }
  return { jsPDF: FakeDoc };
});

import { generateRiskReportPdf, type RiskReportModel } from "./risk-report";

beforeEach(() => {
  textCalls.length = 0;
  saved.length = 0;
});

const emptyModel: RiskReportModel = {
  generatedAt: "2026-01-01T00:00:00.000Z",
  dataFreshness: null,
  totalValue: 0,
  holdings: [],
  sectorWeights: [],
  concentrationFlags: [],
  hhi: 0,
  beta: null,
  betaCoveredWeight: null,
  volatility: null,
  stress: null,
};

describe("generateRiskReportPdf", () => {
  it("handles an empty portfolio and null metrics without throwing", async () => {
    await expect(generateRiskReportPdf(emptyModel, "r.pdf")).resolves.toBeUndefined();
    const all = textCalls.join(" ");
    expect(all).toContain("This portfolio is empty.");
    expect(all).toContain("Not available"); // null beta / volatility / freshness
    expect(saved).toEqual(["r.pdf"]);
  });

  it("renders holdings, warnings, and a stress scenario when present", async () => {
    const model: RiskReportModel = {
      ...emptyModel,
      dataFreshness: "2026-01-01",
      totalValue: 100000,
      holdings: [
        {
          symbol: "ACME",
          name: "Acme",
          sector: "IT",
          quantity: 10,
          value: 60000,
          weight: 0.6,
          piotroskiScore: 7,
          altmanZone: "safe",
        },
        {
          symbol: "BETACO",
          name: "Beta Co",
          sector: "IT",
          quantity: 5,
          value: 40000,
          weight: 0.4,
          piotroskiScore: null, // null metric still renders
          altmanZone: null,
        },
      ],
      sectorWeights: [{ sector: "IT", weight: 1 }],
      concentrationFlags: ["High concentration: 100% in IT."],
      hhi: 0.52,
      beta: 1.1,
      betaCoveredWeight: 1,
      volatility: 0.23,
      stress: {
        marketShockPct: -10,
        totalValue: 100000,
        estimatedLoss: -11000,
        estimatedLossPct: -11,
        perHolding: [
          { symbol: "ACME", value: 60000, beta: 1.1, betaAssumed: false, estimatedLoss: -6600, estimatedLossPct: -11 },
        ],
      },
    };
    await generateRiskReportPdf(model, "full.pdf");
    const all = textCalls.join(" ");
    expect(all).toContain("ACME");
    expect(all).toContain("7/9"); // piotroski
    expect(all).toContain("Not available"); // null piotroski for BETACO
    expect(all).toContain("High concentration: 100% in IT.");
    expect(all).toContain("Hypothetical scenarios");
    expect(all).toContain("Educational analysis only. Not investment advice.");
  });
});
