import { describe, it, expect } from "vitest";
import {
  stripReasoning,
  stripInvalidCitations,
  stripUnknownUrls,
  ensureDisclaimerLine,
  normalizeCitationBrackets,
  postProcess,
} from "./post-process";

const DISCLAIMER = "Educational analysis from company filings, not investment advice.";

describe("stripReasoning", () => {
  it("removes a terminated <think> block", () => {
    const out = stripReasoning("<think>secret chain of thought</think>Answer here.");
    expect(out).toBe("Answer here.");
  });

  it("removes an unterminated <think> block", () => {
    const out = stripReasoning("Answer.\n<think>still thinking...");
    expect(out).toBe("Answer.");
  });

  it("leaves normal text untouched", () => {
    expect(stripReasoning("Just an answer.")).toBe("Just an answer.");
  });
});

describe("stripInvalidCitations", () => {
  it("keeps valid tags and removes unknown ones", () => {
    const { text, strippedAny } = stripInvalidCitations(
      "Revenue rose [S1]. Margins improved [S9].",
      new Set(["S1", "S2"]),
    );
    expect(strippedAny).toBe(true);
    expect(text).toContain("[S1]");
    expect(text).not.toContain("[S9]");
    expect(text).toContain("unverifiable: source not provided");
  });

  it("does nothing when all tags are valid", () => {
    const { text, strippedAny } = stripInvalidCitations(
      "Revenue rose [S1].",
      new Set(["S1"]),
    );
    expect(strippedAny).toBe(false);
    expect(text).toBe("Revenue rose [S1].");
  });
});

describe("stripUnknownUrls", () => {
  it("removes URLs not in the allowed set", () => {
    const out = stripUnknownUrls(
      "See https://nseindia.com/x and https://evil.example/pwn now.",
      new Set(["https://nseindia.com/x"]),
    );
    expect(out).toContain("https://nseindia.com/x");
    expect(out).toContain("[link removed]");
    expect(out).not.toContain("evil.example");
  });
});

describe("ensureDisclaimerLine", () => {
  it("appends the disclaimer when missing", () => {
    expect(ensureDisclaimerLine("Answer.", DISCLAIMER)).toContain(DISCLAIMER);
  });
  it("does not duplicate the disclaimer", () => {
    const text = `Answer.\n\n${DISCLAIMER}`;
    expect(ensureDisclaimerLine(text, DISCLAIMER)).toBe(text);
  });
});

describe("normalizeCitationBrackets", () => {
  it("converts full-width citation brackets to ASCII", () => {
    expect(normalizeCitationBrackets("Revenue rose 【S1】 this year.")).toBe(
      "Revenue rose [S1] this year.",
    );
    expect(normalizeCitationBrackets("See 〔W2〕 for details.")).toBe(
      "See [W2] for details.",
    );
  });
  it("leaves ordinary CJK brackets untouched", () => {
    expect(normalizeCitationBrackets("【注意】これはテスト")).toBe("【注意】これはテスト");
  });
  it("is applied by postProcess so the tag is recognized", () => {
    const res = postProcess("Revenue rose 【S1】.", {
      validTags: ["S1"],
      disclaimer: DISCLAIMER,
    });
    expect(res.text).toContain("[S1]");
    expect(res.strippedCitations).toBe(false); // S1 is valid, not stripped
  });
});

describe("postProcess pipeline", () => {
  it("strips reasoning, drops bad citations, and appends the disclaimer", () => {
    const raw = "<think>hmm</think>Revenue rose [S1] and doubled [S9].";
    const res = postProcess(raw, { validTags: ["S1"], disclaimer: DISCLAIMER });
    expect(res.strippedReasoning).toBe(true);
    expect(res.strippedCitations).toBe(true);
    expect(res.text).toContain("[S1]");
    expect(res.text).not.toContain("[S9]");
    expect(res.text).toContain(DISCLAIMER);
  });

  it("removes unknown URLs in web mode", () => {
    const raw = "Per https://good.com/a see details. Also https://bad.com/x.";
    const res = postProcess(raw, {
      validTags: ["W1"],
      disclaimer: DISCLAIMER,
      allowedUrls: ["https://good.com/a"],
    });
    expect(res.text).toContain("https://good.com/a");
    expect(res.text).not.toContain("bad.com");
  });
});
