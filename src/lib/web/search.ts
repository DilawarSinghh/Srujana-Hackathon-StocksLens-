import "server-only";
import { getServerEnv } from "@/lib/env";

/**
 * Web search abstraction for Web Research mode.
 *
 * searchWeb(query) returns normalized results from the configured provider
 * (SEARCH_PROVIDER = "tavily" | "brave"). The mode is DISABLED when the
 * provider or its API key is not configured: isSearchEnabled() returns false
 * and the route/UI show a friendly message instead of calling anything.
 *
 * No browser agent, no arbitrary navigation — this only queries a search API.
 */

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string;
}

export interface SearchOptions {
  /** Max results to return (provider is asked for at least this many). */
  maxResults?: number;
}

/** True when a search provider is configured with a usable key. */
export function isSearchEnabled(): boolean {
  const env = getServerEnv();
  if (env.SEARCH_PROVIDER === "tavily") return Boolean(env.TAVILY_API_KEY);
  if (env.SEARCH_PROVIDER === "brave") return Boolean(env.BRAVE_SEARCH_API_KEY);
  return false;
}

const SEARCH_TIMEOUT_MS = 8_000;

/**
 * Run a web search via the configured provider. Returns [] on any transport
 * error (the caller treats "no results" uniformly). Throws only when the mode
 * is not configured — callers should gate on isSearchEnabled() first.
 */
export async function searchWeb(
  query: string,
  opts: SearchOptions = {},
): Promise<WebSearchResult[]> {
  const env = getServerEnv();
  const maxResults = opts.maxResults ?? 5;
  if (!isSearchEnabled()) {
    throw new Error("Web search is not configured.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    if (env.SEARCH_PROVIDER === "tavily") {
      return await tavilySearch(query, maxResults, env.TAVILY_API_KEY as string, controller.signal);
    }
    return await braveSearch(query, maxResults, env.BRAVE_SEARCH_API_KEY as string, controller.signal);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function tavilySearch(
  query: string,
  maxResults: number,
  apiKey: string,
  signal: AbortSignal,
): Promise<WebSearchResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: maxResults,
      search_depth: "basic",
    }),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    results?: { title?: string; url?: string; content?: string; published_date?: string }[];
  };
  return (data.results ?? [])
    .filter((r) => r.url)
    .map((r) => ({
      title: r.title ?? r.url ?? "",
      url: r.url as string,
      snippet: r.content ?? "",
      publishedAt: r.published_date,
    }));
}

async function braveSearch(
  query: string,
  maxResults: number,
  apiKey: string,
  signal: AbortSignal,
): Promise<WebSearchResult[]> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(maxResults));
  const res = await fetch(url, {
    signal,
    headers: {
      accept: "application/json",
      "x-subscription-token": apiKey,
    },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    web?: {
      results?: { title?: string; url?: string; description?: string; page_age?: string }[];
    };
  };
  return (data.web?.results ?? [])
    .filter((r) => r.url)
    .map((r) => ({
      title: r.title ?? r.url ?? "",
      url: r.url as string,
      snippet: r.description ?? "",
      publishedAt: r.page_age,
    }));
}
