import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadStockContext } from "@/lib/rag/context";
import { renderDataBlock } from "@/lib/rag/prompt";
import {
  RESEARCH_SYSTEM_PROMPT,
  RESEARCH_DISCLAIMER,
  renderWebSources,
  type WebSourceInput,
} from "@/lib/rag/research-prompt";
import {
  streamWithFallback,
  AllModelsFailedError,
} from "@/lib/rag/model-chain";
import {
  isAdviceSeeking,
  buildRefusal,
  containsAdvice,
} from "@/lib/rag/guardrails";
import { postProcess } from "@/lib/llm/post-process";
import { isWebResearchRateLimited } from "@/lib/rag/rate-limit";
import { isSearchEnabled, searchWeb, type WebSearchResult } from "@/lib/web/search";
import { fetchPageText, PageFetchError } from "@/lib/web/fetch-page";
import { buildQueries } from "@/lib/web/queries";
import { buildAllowlist, isAllowlisted, hostOf } from "@/config/web-sources";
import { cacheGet, cacheSet, SEARCH_TTL_MS, PAGE_TTL_MS } from "@/lib/web/cache";
import type { ChatSource, TablesInsert } from "@/types/database";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_PAGES = 4;

const bodySchema = z.object({
  symbol: z.string().trim().min(1).max(40),
  question: z.string().trim().min(1).max(500),
});

/** Stream a fixed string as a data-stream response (refusals / messages). */
function streamPlainText(text: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`0:${JSON.stringify(text)}\n`));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "x-vercel-ai-data-stream": "v1",
    },
  });
}

/** Cached web search (30 min). */
async function cachedSearch(query: string): Promise<WebSearchResult[]> {
  const hit = await cacheGet("search", query);
  if (hit) {
    try {
      return JSON.parse(hit) as WebSearchResult[];
    } catch {
      /* fall through to live search */
    }
  }
  const results = await searchWeb(query, { maxResults: 6 });
  await cacheSet("search", query, JSON.stringify(results), SEARCH_TTL_MS);
  return results;
}

/** Cached page text (6 h). Returns null on any policy/transport failure. */
async function cachedFetchPage(
  url: string,
  allowlist: string[],
): Promise<{ text: string; retrievedAt: string } | null> {
  const hit = await cacheGet("page", url);
  if (hit) {
    try {
      return JSON.parse(hit) as { text: string; retrievedAt: string };
    } catch {
      /* fall through */
    }
  }
  try {
    const res = await fetchPageText(url, allowlist);
    const payload = { text: res.text, retrievedAt: res.retrievedAt };
    await cacheSet("page", url, JSON.stringify(payload), PAGE_TTL_MS);
    return payload;
  } catch (e) {
    if (!(e instanceof PageFetchError)) console.error("fetchPage:", e);
    return null;
  }
}

/** Citation metadata for the WEB sources actually cited in the answer. */
function citedWebSources(sources: WebSourceInput[], answer: string): ChatSource[] {
  const out: ChatSource[] = [];
  sources.forEach((s, i) => {
    const tag = `W${i + 1}`;
    if (answer.includes(`[${tag}]`)) {
      out.push({
        id: tag,
        doc: s.title,
        fiscalYear: null,
        page: null,
        section: hostOf(s.url) ?? null,
        snippet: s.text.slice(0, 300),
        url: s.url,
      });
    }
  });
  return out;
}

export async function POST(request: Request) {
  // 1. Parse + validate.
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // 2. Require login.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Please sign in to use web research." },
      { status: 401 },
    );
  }

  // 3. Mode disabled when no search provider/key is configured.
  if (!isSearchEnabled()) {
    return NextResponse.json(
      {
        error:
          "Web research is not available right now (no search provider configured).",
      },
      { status: 503 },
    );
  }

  const admin = createAdminClient();

  // 4. Look up the stock.
  const { data: stock } = await admin
    .from("stocks")
    .select("id, name, symbol")
    .eq("symbol", body.symbol.toUpperCase())
    .maybeSingle();
  if (!stock) {
    return NextResponse.json({ error: "Unknown stock." }, { status: 404 });
  }

  // 5. Own hourly rate limit for web research (10/hour, separate counter).
  if (await isWebResearchRateLimited(admin, user.id)) {
    return NextResponse.json(
      {
        error:
          "You've reached the hourly web-research limit. Please try again a little later.",
      },
      { status: 429 },
    );
  }

  // Load structured DATA + neutral bullets (for a refusal).
  const ctx = await loadStockContext(stock.id);
  const dataBlock = ctx?.data ?? null;
  const refusal = buildRefusal({
    company: stock.name,
    bullets: ctx?.neutralBullets ?? [],
  });

  // Persist the user question (best-effort), tagged mode='web'.
  await admin.from("chat_messages").insert({
    user_id: user.id,
    stock_id: stock.id,
    role: "user",
    content: body.question,
    mode: "web",
  } satisfies TablesInsert<"chat_messages">);

  // 6. INTENT GUARD — advice questions get the standard refusal, no search.
  if (isAdviceSeeking(body.question)) {
    await admin.from("chat_messages").insert({
      user_id: user.id,
      stock_id: stock.id,
      role: "assistant",
      content: refusal,
      sources: [],
      mode: "web",
    } satisfies TablesInsert<"chat_messages">);
    return streamPlainText(refusal);
  }

  // 7. Build focused queries + the allowlist (company's IR domain unknown here).
  const allowlist = buildAllowlist();
  const queries = buildQueries({
    company: stock.name,
    symbol: stock.symbol,
    question: body.question,
  });

  // 8. Search (cached) and keep only allowlisted result URLs, de-duplicated.
  const seen = new Set<string>();
  const allowed: WebSearchResult[] = [];
  for (const q of queries) {
    const results = await cachedSearch(q);
    for (const r of results) {
      if (!isAllowlisted(r.url, allowlist)) continue; // non-allowlisted -> never fed to the model
      if (seen.has(r.url)) continue;
      seen.add(r.url);
      allowed.push(r);
      if (allowed.length >= MAX_PAGES) break;
    }
    if (allowed.length >= MAX_PAGES) break;
  }

  // 9. Fetch up to MAX_PAGES allowlisted pages (cached, SSRF-safe).
  const sources: WebSourceInput[] = [];
  for (const r of allowed) {
    const page = await cachedFetchPage(r.url, allowlist);
    if (page && page.text.trim().length > 0) {
      sources.push({ title: r.title, url: r.url, text: page.text, retrievedAt: page.retrievedAt });
    }
    if (sources.length >= MAX_PAGES) break;
  }

  if (sources.length === 0) {
    const msg =
      "I couldn't find reliable information about this in the available web sources.";
    await admin.from("chat_messages").insert({
      user_id: user.id,
      stock_id: stock.id,
      role: "assistant",
      content: `${msg}\n\n${RESEARCH_DISCLAIMER}`,
      sources: [],
      mode: "web",
    } satisfies TablesInsert<"chat_messages">);
    return streamPlainText(`${msg}\n\n${RESEARCH_DISCLAIMER}`);
  }

  // 10. Build the prompt and stream the answer.
  const webSourcesText = renderWebSources(sources);
  const dataText = dataBlock ? renderDataBlock(dataBlock) : "DATA: (none)";
  const validTags = sources.map((_, i) => `W${i + 1}`);
  const allowedUrls = sources.map((s) => s.url);

  try {
    const result = await streamWithFallback({
      system: RESEARCH_SYSTEM_PROMPT,
      messages: [
        {
          role: "user" as const,
          content: `${webSourcesText}\n\n${dataText}\n\nQUESTION: ${body.question}`,
        },
      ],
      async onFinish({ text }) {
        // Post-process: strip <think>, drop citation tags not in W1..Wn, remove
        // any URL that was not among the provided sources, ensure the disclaimer.
        const processed = postProcess(text, {
          validTags,
          disclaimer: RESEARCH_DISCLAIMER,
          allowedUrls,
        }).text;
        // Advice output guard: replace with the refusal if advice slipped in.
        const safe = containsAdvice(processed) ? refusal : processed;
        const cited = citedWebSources(sources, safe);
        await admin.from("chat_messages").insert({
          user_id: user.id,
          stock_id: stock.id,
          role: "assistant",
          content: safe,
          sources: cited,
          mode: "web",
        } satisfies TablesInsert<"chat_messages">);
      },
    });
    return result.toDataStreamResponse();
  } catch (e) {
    const err = e as Error & { statusCode?: number };
    const status =
      e instanceof AllModelsFailedError || err?.statusCode === 429 ? 429 : 500;
    const message =
      status === 429
        ? "The AI service is busy right now. Please try again shortly."
        : "Something went wrong generating an answer. Please try again.";
    return NextResponse.json({ error: message }, { status });
  }
}
