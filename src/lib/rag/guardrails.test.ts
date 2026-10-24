import { describe, it, expect } from "vitest";
import {
  isAdviceSeeking,
  containsAdvice,
  buildRefusal,
  ensureDisclaimer,
  sanitizeOutput,
  DISCLAIMER_LINE,
} from "./guardrails";

// 15+ advice-seeking questions that MUST be caught by the intent guard.
const ADVICE_QUESTIONS = [
  "Should I buy this stock?",
  "should i sell reliance now",
  "Should I hold or sell?",
  "Is this a good investment?",
  "Is it a good buy right now?",
  "Is this stock a safe bet?",
  "Will the price go up next year?",
  "will it double in 2 years?",
  "Will the share crash?",
  "What's your target price for TCS?",
  "Give me a price target.",
  "Where will the stock be in 5 years?",
  "How high will it go?",
  "Can I make money on this?",
  "Is this a multibagger?",
  "What's your recommendation?",
  "Do you recommend buying this?",
  "What is a good entry point?",
  "Should I book profit now?",
  "Is it worth investing?",
];

// 10+ safe questions that must NOT be flagged.
const SAFE_QUESTIONS = [
  "Summarize the key risks.",
  "Why is debt changing?",
  "What did management say about margins?",
  "What does the auditor's report say?",
  "What was the revenue in FY24?",
  "Explain the company's business segments.",
  "How much did net profit grow over 3 years?",
  "What are the related-party transactions?",
  "Describe the promoter shareholding.",
  "What does the company say about capital expenditure?",
  "What are the main business risks mentioned in the filing?",
  "How did operating cash flow trend?",
];

describe("isAdviceSeeking", () => {
  for (const q of ADVICE_QUESTIONS) {
    it(`flags: "${q}"`, () => {
      expect(isAdviceSeeking(q)).toBe(true);
    });
  }
  for (const q of SAFE_QUESTIONS) {
    it(`allows: "${q}"`, () => {
      expect(isAdviceSeeking(q)).toBe(false);
    });
  }
});

describe("containsAdvice (output guard)", () => {
  const BAD_OUTPUTS = [
    "You should buy this stock.",
    "This is a strong buy.",
    "I recommend buying now.",
    "My recommendation is to sell.",
    "The target price is ₹3000.",
    "Price target: 3000.",
    "This stock will definitely go up.",
    "It will double soon.",
    "This is a good investment.",
    "You must buy before earnings.",
    "This will make you money.",
    "Sell now before it falls.",
  ];
  for (const t of BAD_OUTPUTS) {
    it(`catches: "${t}"`, () => {
      expect(containsAdvice(t)).toBe(true);
    });
  }

  const GOOD_OUTPUTS = [
    "Revenue grew 12% in FY24 [S1].",
    "Management states margins improved due to cost control [S2].",
    "The auditor issued an unqualified opinion [S1].",
    "Debt fell from ₹500 crore to ₹300 crore [S3].",
    "The company operates in three segments [S1].",
  ];
  for (const t of GOOD_OUTPUTS) {
    it(`allows: "${t}"`, () => {
      expect(containsAdvice(t)).toBe(false);
    });
  }
});

describe("buildRefusal", () => {
  it("leads with a refusal, lists bullets, ends with disclaimer", () => {
    const r = buildRefusal({
      company: "Acme Ltd",
      bullets: ["ROE is strong.", "Red flag: high pledge.", "Average fundamentals."],
    });
    expect(r).toContain("I can't tell you whether to buy or sell.");
    expect(r).toContain("Acme Ltd");
    expect(r).toContain("- ROE is strong.");
    expect(r.endsWith(DISCLAIMER_LINE)).toBe(true);
  });
  it("handles no bullets gracefully", () => {
    const r = buildRefusal({ company: "X", bullets: [] });
    expect(r).toContain("don't have enough scored data");
    expect(r.endsWith(DISCLAIMER_LINE)).toBe(true);
  });
});

describe("ensureDisclaimer", () => {
  it("appends when missing", () => {
    expect(ensureDisclaimer("Revenue grew.")).toContain(DISCLAIMER_LINE);
  });
  it("does not duplicate", () => {
    const withIt = `Revenue grew.\n\n${DISCLAIMER_LINE}`;
    const out = ensureDisclaimer(withIt);
    expect(out.match(new RegExp(DISCLAIMER_LINE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))?.length).toBe(1);
  });
});

describe("sanitizeOutput", () => {
  const refusal = "REFUSAL TEXT";
  it("replaces advice output with the refusal", () => {
    const { text, replaced } = sanitizeOutput("You should buy this.", refusal);
    expect(replaced).toBe(true);
    expect(text).toBe(refusal);
  });
  it("keeps safe output and ensures disclaimer", () => {
    const { text, replaced } = sanitizeOutput("Revenue grew 10% [S1].", refusal);
    expect(replaced).toBe(false);
    expect(text).toContain(DISCLAIMER_LINE);
  });
});
