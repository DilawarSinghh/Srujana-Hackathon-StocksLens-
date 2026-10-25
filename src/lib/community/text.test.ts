import { describe, it, expect } from "vitest";
import { extractHashtags, extractCashtags, extractMentions, tokenizePost } from "./text";

describe("extractHashtags", () => {
  it("extracts unique lowercased hashtags", () => {
    expect(extractHashtags("Loving #Nifty and #nifty and #Banks")).toEqual(["nifty", "banks"]);
  });
  it("returns [] when none", () => {
    expect(extractHashtags("no tags here")).toEqual([]);
  });
});

describe("extractCashtags", () => {
  it("extracts unique uppercased cashtags", () => {
    expect(extractCashtags("$tcs vs $INFY vs $Tcs")).toEqual(["TCS", "INFY"]);
  });
});

describe("extractMentions", () => {
  it("extracts handles without the @", () => {
    expect(extractMentions("cc @alice and @bob")).toEqual(["alice", "bob"]);
  });
});

describe("tokenizePost (XSS-safe rendering)", () => {
  it("never emits HTML — angle brackets stay as plain text", () => {
    const tokens = tokenizePost("<script>alert(1)</script>");
    expect(tokens).toEqual([{ kind: "text", value: "<script>alert(1)</script>" }]);
  });

  it("splits hashtags, cashtags, mentions, and urls", () => {
    const tokens = tokenizePost("Check $TCS #earnings @ceo https://example.com now");
    const kinds = tokens.map((t) => t.kind);
    expect(kinds).toContain("cashtag");
    expect(kinds).toContain("hashtag");
    expect(kinds).toContain("mention");
    expect(kinds).toContain("url");
    const cash = tokens.find((t) => t.kind === "cashtag");
    expect(cash && cash.value).toBe("TCS");
  });

  it("does not treat a # inside a URL as a hashtag", () => {
    const tokens = tokenizePost("see https://a.com/p#section done");
    const urls = tokens.filter((t) => t.kind === "url");
    expect(urls).toHaveLength(1);
    expect(urls[0].value).toBe("https://a.com/p#section");
    expect(tokens.some((t) => t.kind === "hashtag")).toBe(false);
  });

  it("round-trips plain text content", () => {
    const text = "hello world";
    const joined = tokenizePost(text).map((t) => (t.kind === "text" ? t.value : "")).join("");
    expect(joined).toBe(text);
  });
});
