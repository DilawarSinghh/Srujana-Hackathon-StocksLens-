import { describe, it, expect, vi, beforeEach } from "vitest";

const env: Record<string, string | undefined> = {};
vi.mock("@/lib/env", () => ({ getServerEnv: () => env }));

import { isSearchEnabled, searchWeb } from "./search";

beforeEach(() => {
  for (const k of Object.keys(env)) delete env[k];
  vi.restoreAllMocks();
});

describe("isSearchEnabled", () => {
  it("is false without a provider or key", () => {
    expect(isSearchEnabled()).toBe(false);
    env.SEARCH_PROVIDER = "tavily";
    expect(isSearchEnabled()).toBe(false);
    env.TAVILY_API_KEY = "k";
    expect(isSearchEnabled()).toBe(true);
  });
  it("is true for brave with a key", () => {
    env.SEARCH_PROVIDER = "brave";
    env.BRAVE_SEARCH_API_KEY = "k";
    expect(isSearchEnabled()).toBe(true);
  });
});

describe("searchWeb", () => {
  it("throws when not configured", async () => {
    await expect(searchWeb("x")).rejects.toThrow();
  });

  it("normalizes tavily results", async () => {
    env.SEARCH_PROVIDER = "tavily";
    env.TAVILY_API_KEY = "k";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            { title: "T", url: "https://x.com/a", content: "snip", published_date: "2024-01-01" },
            { content: "no url dropped" },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ) as Response,
    );
    const out = await searchWeb("query");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      title: "T",
      url: "https://x.com/a",
      snippet: "snip",
      publishedAt: "2024-01-01",
    });
  });

  it("normalizes brave results", async () => {
    env.SEARCH_PROVIDER = "brave";
    env.BRAVE_SEARCH_API_KEY = "k";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          web: { results: [{ title: "B", url: "https://y.com/a", description: "desc" }] },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ) as Response,
    );
    const out = await searchWeb("query");
    expect(out[0]).toMatchObject({ title: "B", url: "https://y.com/a", snippet: "desc" });
  });

  it("returns [] on transport error", async () => {
    env.SEARCH_PROVIDER = "tavily";
    env.TAVILY_API_KEY = "k";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));
    expect(await searchWeb("query")).toEqual([]);
  });
});
