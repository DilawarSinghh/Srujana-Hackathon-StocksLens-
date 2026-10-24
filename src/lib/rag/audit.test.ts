import { describe, it, expect, vi, beforeEach } from "vitest";

const generateWithFallback = vi.fn();
vi.mock("./model-chain", () => ({
  generateWithFallback: (...args: unknown[]) => generateWithFallback(...args),
}));

import { auditAnswer } from "./audit";
import type { RetrievedChunk } from "./retrieve";

const chunks: RetrievedChunk[] = [
  {
    id: "1",
    filingId: "f1",
    page: 12,
    section: "MD&A",
    content: "Revenue was 1000 crore in FY24.",
    similarity: 0.9,
    filingTitle: "Annual Report",
    sourceUrl: null,
    docType: "annual_report",
    fiscalYear: 2024,
  },
];

beforeEach(() => generateWithFallback.mockReset());

describe("auditAnswer", () => {
  it("parses valid JSON and counts grounded/unverifiable", async () => {
    generateWithFallback.mockResolvedValueOnce({
      text: JSON.stringify({
        claims: [
          { sentence: "Revenue was 1000 crore.", status: "grounded" },
          { sentence: "The stock will rise.", status: "unverifiable" },
          { sentence: "Not investment advice.", status: "not_a_claim" },
        ],
      }),
    });
    const r = await auditAnswer("some answer", chunks, { pe: 20 });
    expect(r).not.toBeNull();
    expect(r?.groundedCount).toBe(1);
    expect(r?.unverifiableCount).toBe(1);
    expect(r?.claims).toHaveLength(3);
  });

  it("extracts JSON even when wrapped in prose", async () => {
    generateWithFallback.mockResolvedValueOnce({
      text: 'Here you go:\n{"claims":[{"sentence":"X.","status":"grounded"}]}\nDone.',
    });
    const r = await auditAnswer("answer", chunks, null);
    expect(r?.groundedCount).toBe(1);
  });

  it("returns null when the model output is not valid JSON", async () => {
    generateWithFallback.mockResolvedValueOnce({ text: "no json here" });
    expect(await auditAnswer("answer", chunks, null)).toBeNull();
  });

  it("returns null when JSON fails schema validation", async () => {
    generateWithFallback.mockResolvedValueOnce({
      text: JSON.stringify({ claims: [{ sentence: "X", status: "bogus" }] }),
    });
    expect(await auditAnswer("answer", chunks, null)).toBeNull();
  });

  it("returns null when the audit call throws (timeout/failure)", async () => {
    generateWithFallback.mockRejectedValueOnce(new Error("timeout"));
    expect(await auditAnswer("answer", chunks, null)).toBeNull();
  });

  it("returns null for an empty answer without calling the model", async () => {
    expect(await auditAnswer("   ", chunks, null)).toBeNull();
    expect(generateWithFallback).not.toHaveBeenCalled();
  });
});
