import { describe, it, expect } from "vitest";
import { extractFirstJsonObject, parseAgentJson } from "@/lib/debate/parse";
import { bullSchema, judgeSchema } from "@/lib/debate/schema";

describe("extractFirstJsonObject", () => {
  it("extracts a bare JSON object", () => {
    expect(extractFirstJsonObject('{"a":1}')).toBe('{"a":1}');
  });

  it("extracts JSON wrapped in prose", () => {
    const raw = 'Sure! Here is the result:\n{"a":1,"b":2}\nHope that helps.';
    expect(extractFirstJsonObject(raw)).toBe('{"a":1,"b":2}');
  });

  it("unwraps a ```json fenced block", () => {
    const raw = "```json\n{\"a\":1}\n```";
    expect(extractFirstJsonObject(raw)).toBe('{"a":1}');
  });

  it("strips <think> reasoning before the JSON", () => {
    const raw = "<think>let me reason {not json}</think>{\"a\":1}";
    expect(extractFirstJsonObject(raw)).toBe('{"a":1}');
  });

  it("respects braces inside string literals", () => {
    const raw = '{"note":"a } brace in a string","ok":true}';
    expect(extractFirstJsonObject(raw)).toBe(raw);
  });

  it("returns null when there is no object", () => {
    expect(extractFirstJsonObject("no json here")).toBeNull();
  });
});

describe("parseAgentJson", () => {
  it("validates a well-formed bull payload", () => {
    const raw = JSON.stringify({
      summary: "Solid profitability and consistent growth support the thesis.",
      claims: [
        {
          id: "C1",
          claim: "ROE is high for the sector.",
          evidence: [{ statement: "ROE 18%", source: "StockLens metric: ROE", period: "FY2025" }],
          reasoning: "High returns on equity indicate efficient capital use.",
        },
      ],
      dataGaps: ["No peer valuation comparables"],
    });
    const res = parseAgentJson(raw, bullSchema);
    expect(res.ok).toBe(true);
    expect(res.value?.claims[0].id).toBe("C1");
    // Optional fields get defaults.
    expect(res.value?.claims[0].evidence[0].citation).toBe("");
  });

  it("fails cleanly on non-JSON", () => {
    const res = parseAgentJson("the model refused to answer", bullSchema);
    expect(res.ok).toBe(false);
    expect(res.value).toBeNull();
    expect(res.error).toMatch(/No JSON object/i);
  });

  it("fails cleanly on schema mismatch", () => {
    // Missing required `summary`.
    const res = parseAgentJson('{"claims":[]}', bullSchema);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/did not match/i);
  });

  it("rejects an invalid judge assessment value", () => {
    const raw = JSON.stringify({
      assessment: "definitely_buy",
      confidence: "high",
      conclusion: "x",
    });
    const res = parseAgentJson(raw, judgeSchema);
    expect(res.ok).toBe(false);
  });

  it("accepts a calibrated 'insufficient_evidence' judge verdict", () => {
    const raw = JSON.stringify({
      assessment: "insufficient_evidence",
      confidence: "low",
      conclusion: "Neither side established its case given the data gaps.",
    });
    const res = parseAgentJson(raw, judgeSchema);
    expect(res.ok).toBe(true);
    expect(res.value?.assessment).toBe("insufficient_evidence");
  });
});
