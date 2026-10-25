import { describe, it, expect } from "vitest";
import {
  normalizeHost,
  hostOf,
  buildAllowlist,
  isAllowlisted,
  BASE_ALLOWLIST,
} from "./web-sources";

describe("normalizeHost", () => {
  it("lowercases and strips www.", () => {
    expect(normalizeHost("WWW.NSEindia.com")).toBe("nseindia.com");
  });
});

describe("hostOf", () => {
  it("returns the normalized host", () => {
    expect(hostOf("https://www.moneycontrol.com/x")).toBe("moneycontrol.com");
  });
  it("returns null for junk", () => {
    expect(hostOf("not a url")).toBeNull();
  });
});

describe("buildAllowlist", () => {
  it("includes the base list", () => {
    const list = buildAllowlist();
    for (const d of BASE_ALLOWLIST) expect(list).toContain(d);
  });
  it("adds a per-stock IR domain when provided", () => {
    const list = buildAllowlist("www.Example-IR.com");
    expect(list).toContain("example-ir.com");
  });
});

describe("isAllowlisted", () => {
  const list = buildAllowlist();
  it("allows exact and subdomain matches", () => {
    expect(isAllowlisted("https://nseindia.com/a", list)).toBe(true);
    expect(isAllowlisted("https://archives.nseindia.com/a", list)).toBe(true);
    expect(isAllowlisted("https://www.sebi.gov.in/x", list)).toBe(true);
  });
  it("rejects non-allowlisted domains", () => {
    expect(isAllowlisted("https://randomblog.com/x", list)).toBe(false);
    // Lookalike must not be allowed via naive substring.
    expect(isAllowlisted("https://nseindia.com.evil.co/x", list)).toBe(false);
  });
});
