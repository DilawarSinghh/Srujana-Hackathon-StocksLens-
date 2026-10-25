import { describe, it, expect, vi } from "vitest";
import { runDebate, type GenerateFn, type DebateInput } from "@/lib/debate/orchestrator";
import type { ChatDataBlock } from "@/lib/rag/context";

/**
 * Orchestration tests. The `generate` function is injected with scripted
 * outputs so NO real provider is called (no live API quota). We verify:
 *  - correct execution order (bull -> devil -> judge),
 *  - the devil receives the bull's actual claims,
 *  - a bull failure never fabricates a verdict,
 *  - a devil failure produces a clear incomplete judge state,
 *  - the judge can return mixed / insufficient evidence (no forced winner),
 *  - the advice output guard withholds disallowed advice.
 */

const SNAPSHOT: ChatDataBlock = {
  symbol: "MARUTI",
  name: "Maruti Suzuki India Ltd",
  exchange: "NSE",
  sector: "Automobile",
  industry: "Passenger cars",
  as_of: "2026-10-24",
  metrics: { pe: 28.5, roe: 16.2, debt_to_equity: null },
  price_summary: {
    as_of: "2026-10-24",
    latest_close: 11000,
    first_date: "2021-10-24",
    first_close: 7000,
    change_pct: 57,
    points: 1200,
    week52_high: 13000,
    week52_low: 9000,
  },
  fundamentals_annual: [{ fiscal_year: 2025, revenue: 140000, net_profit: 13000 }],
  score: {
    total_score: 72,
    label: "Strong",
    data_confidence: 0.9,
    capped: false,
    formula_version: "v1.0",
    pillars: [],
  },
  red_flags: [],
  governance: null,
  missing: ["Debt-to-equity"],
};

const INPUT: DebateInput = {
  data: SNAPSHOT,
  chunks: [],
  focus: "overall",
  thesis: "Strong brand and cash flow justify the price.",
};

const BULL_JSON = JSON.stringify({
  summary: "Profitability and growth are strong relative to peers.",
  claims: [
    {
      id: "C1",
      claim: "ROE of 16.2% reflects efficient capital use.",
      evidence: [{ statement: "ROE 16.2%", source: "StockLens metric: ROE", period: "latest" }],
      reasoning: "Returns comfortably exceed cost of equity.",
      limitations: "Single-period figure.",
    },
  ],
  dataGaps: ["No sector P/E comparables provided"],
});

const DEVIL_JSON = JSON.stringify({
  summary: "Valuation and a missing leverage picture temper the bull case.",
  counterarguments: [
    {
      id: "D1",
      targetsClaimId: "C1",
      counter: "A single-period ROE may not be durable.",
      evidence: [{ statement: "Only FY2025 shown", source: "FY2025 fundamentals", period: "FY2025" }],
      reasoning: "One year cannot establish a trend.",
      severity: "hypothesis",
      resolvesWith: "Multi-year ROE history.",
    },
  ],
  dataGaps: ["Debt-to-equity unavailable"],
});

const JUDGE_JSON = JSON.stringify({
  assessment: "mixed",
  confidence: "moderate",
  conclusion: "Both sides raise fair points; evidence is mixed given data gaps.",
  survivingBullPoints: ["C1: ROE is genuinely high"],
  substantiatedCounters: ["D1: durability is unproven on one period"],
  unresolved: ["Leverage profile is unknown"],
  strongestSupport: "High ROE",
  strongestCounter: "Missing D/E",
  dataGaps: ["Debt-to-equity"],
  whatWouldChange: ["A multi-year ROE and leverage disclosure"],
});

describe("runDebate — happy path", () => {
  it("runs bull -> devil -> judge in order and passes bull claims to the devil", async () => {
    const calls: string[] = [];
    const generate: GenerateFn = vi.fn(async ({ system, messages }) => {
      const content = messages.map((m: { content: string }) => m.content).join("\n");
      if (system.includes("BULL analyst")) {
        calls.push("bull");
        return BULL_JSON;
      }
      if (system.includes("DEVIL'S ADVOCATE")) {
        calls.push("devil");
        // The devil must receive the bull's actual claim text.
        expect(content).toContain("ROE of 16.2% reflects efficient capital use.");
        return DEVIL_JSON;
      }
      calls.push("judge");
      // The judge must receive both the bull and the devil outputs.
      expect(content).toContain("ROE of 16.2% reflects efficient capital use.");
      expect(content).toContain("A single-period ROE may not be durable.");
      return JUDGE_JSON;
    });

    const out = await runDebate(INPUT, generate);
    expect(calls).toEqual(["bull", "devil", "judge"]);
    expect(out.bull.status).toBe("ok");
    expect(out.devil.status).toBe("ok");
    expect(out.judge.status).toBe("ok");
    expect(out.judge.output?.assessment).toBe("mixed");
  });

  it("includes the canonical snapshot (score reported, not recomputed) in the bull prompt", async () => {
    let bullContent = "";
    const generate: GenerateFn = vi.fn(async ({ system, messages }) => {
      if (system.includes("BULL analyst")) {
        bullContent = messages.map((m: { content: string }) => m.content).join("\n");
        return BULL_JSON;
      }
      if (system.includes("DEVIL'S ADVOCATE")) return DEVIL_JSON;
      return JUDGE_JSON;
    });
    await runDebate(INPUT, generate);
    // The deterministic score and the MISSING list are present in the evidence.
    expect(bullContent).toContain('"total_score":72');
    expect(bullContent).toMatch(/MISSING[^\n]*Debt-to-equity/);
    // The missing metric is not silently zeroed.
    expect(bullContent).not.toContain('"debt_to_equity":0');
  });
});

describe("runDebate — partial failures (honest, no fabrication)", () => {
  it("does NOT produce a verdict when the bull fails", async () => {
    const generate: GenerateFn = vi.fn(async ({ system }) => {
      if (system.includes("BULL analyst")) return "the model rambled, no json";
      return JUDGE_JSON; // should never be reached
    });
    const out = await runDebate(INPUT, generate);
    expect(out.bull.status).toBe("failed");
    expect(out.devil.status).toBe("failed");
    expect(out.judge.status).toBe("failed");
    expect(out.judge.output).toBeNull();
    // The devil/judge were skipped, not called.
    expect((generate as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(1);
  });

  it("marks the judge incomplete when the devil fails", async () => {
    const generate: GenerateFn = vi.fn(async ({ system }) => {
      if (system.includes("BULL analyst")) return BULL_JSON;
      if (system.includes("DEVIL'S ADVOCATE")) return "not valid json";
      return JUDGE_JSON; // should never be reached
    });
    const out = await runDebate(INPUT, generate);
    expect(out.bull.status).toBe("ok");
    expect(out.devil.status).toBe("failed");
    expect(out.judge.status).toBe("failed");
    expect(out.judge.output).toBeNull();
    expect((generate as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(2);
  });

  it("surfaces a provider failure as a failed agent, not a fake result", async () => {
    const { AllModelsFailedError } = await import("@/lib/rag/model-chain");
    const generate: GenerateFn = vi.fn(async () => {
      throw new AllModelsFailedError(new Error("boom"), 429, 3000);
    });
    const out = await runDebate(INPUT, generate);
    expect(out.bull.status).toBe("failed");
    expect(out.bull.providerFailed).toBe(true);
    expect(out.bull.code).toBe("rate_limited");
  });

  it("tags a not_configured provider failure so the route can skip quota metering", async () => {
    const { LlmNotConfiguredError } = await import("@/lib/llm/errors");
    const generate: GenerateFn = vi.fn(async () => {
      throw new LlmNotConfiguredError();
    });
    const out = await runDebate(INPUT, generate);
    expect(out.bull.status).toBe("failed");
    expect(out.bull.code).toBe("not_configured");
    expect(out.judge.output).toBeNull(); // never a fabricated verdict
  });
});

describe("runDebate — guardrails", () => {
  it("withholds a bull output that contains disallowed advice", async () => {
    const adviceBull = JSON.stringify({
      summary: "This is a great buy and will definitely go up.",
      claims: [],
      dataGaps: [],
    });
    const generate: GenerateFn = vi.fn(async ({ system }) =>
      system.includes("BULL analyst") ? adviceBull : JUDGE_JSON,
    );
    const out = await runDebate(INPUT, generate);
    expect(out.bull.status).toBe("failed");
    expect(out.bull.error).toMatch(/advice/i);
  });

  it("allows the judge to conclude insufficient evidence (no forced winner)", async () => {
    const judgeInsufficient = JSON.stringify({
      assessment: "insufficient_evidence",
      confidence: "low",
      conclusion: "Data gaps prevent a confident lean either way.",
    });
    const generate: GenerateFn = vi.fn(async ({ system }) => {
      if (system.includes("BULL analyst")) return BULL_JSON;
      if (system.includes("DEVIL'S ADVOCATE")) return DEVIL_JSON;
      return judgeInsufficient;
    });
    const out = await runDebate(INPUT, generate);
    expect(out.judge.status).toBe("ok");
    expect(out.judge.output?.assessment).toBe("insufficient_evidence");
  });
});
