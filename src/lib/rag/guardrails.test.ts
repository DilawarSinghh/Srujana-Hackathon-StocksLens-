import { describe, it, expect } from "vitest";
import {
  isAdviceSeeking,
  containsAdvice,
  buildRefusal,
  ensureDisclaimer,
  sanitizeOutput,
  normalizeForGuard,
  DISCLAIMER_LINE,
} from "./guardrails";

// The 20 audit prompts (16 that always passed + the 4 that previously slipped).
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
  // The 4 previously missed by the guard:
  "will Reliance double",
  "which stock is best",
  "kya mujhe ye stock lena chahiye",
  "kya main ye share bechun",
];

// 30+ more advice variants (English + Hinglish) that must be blocked.
const MORE_ADVICE = [
  "should I invest in TCS",
  "is it worth buying at this price",
  "good time to buy Infosys?",
  "is it safe to invest now",
  "will ITC go up this year",
  "will the stock tank",
  "which is the best stock to buy right now",
  "which company is the top pick",
  "what should I invest in",
  "what should I put my money in",
  "give me your top picks",
  "recommend me a stock to buy",
  "do you recommend selling",
  "should I get Reliance",
  "should I take HDFC Bank",
  "is TCS a smart buy",
  "target price for Infosys",
  "where will the price be in 3 years",
  "how much will it rise",
  "can I lose money on this",
  "is this a multi bagger",
  "should I book loss now",
  "what is a good entry price",
  "kya mujhe ye share lena chahiye",
  "mujhe ye stock kharidna chahiye kya",
  "is stock ko kharid lu kya",
  "ye share bech du kya",
  "kaunsa stock accha hai",
  "kaunsa share badhiya rahega",
  "ITC badhega kya",
  "reliance girega kya",
  "double hoga kya",
  "kab kharidu is stock ko",
  "paisa lagau is stock me kya",
  "invest karu kya ismein",
];

// 20+ safe questions that must NOT be flagged (incl. false-positive traps).
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
  // False-positive traps from the task — these MUST pass:
  "the company bought back shares",
  "tell me about the buyback",
  "what do sell-side analysts cover",
  "what were the selling expenses",
  "the promoter sold shares last quarter",
  "how large was the share buyback",
  "explain selling and distribution expenses",
  "did the promoter sell any stake",
  "what is the dividend history",
  "who is the statutory auditor",
];

describe("isAdviceSeeking", () => {
  for (const q of [...ADVICE_QUESTIONS, ...MORE_ADVICE]) {
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

describe("normalizeForGuard", () => {
  it("lowercases, strips punctuation, collapses spaces", () => {
    expect(normalizeForGuard("  Should I BUY?!  ")).toBe("should i buy");
  });
  it("folds Hinglish spellings", () => {
    expect(normalizeForGuard("kharidna")).toContain("kharid");
    expect(normalizeForGuard("khareed")).toContain("kharid");
    expect(normalizeForGuard("konsa")).toContain("kaunsa");
  });
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
    // Hinglish advice in output:
    "aap ise kharid lo",
    "ise bech do abhi",
    "ye accha investment hai",
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
    "The company bought back shares worth ₹100 crore [S1].",
    "Selling expenses rose 8% year over year [S2].",
    "The promoter sold a 2% stake in the quarter [S3].",
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
