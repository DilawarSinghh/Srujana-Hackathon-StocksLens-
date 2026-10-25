import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { retrieveChunks, type RetrievedChunk } from "@/lib/rag/retrieve";
import { loadStockContext } from "@/lib/rag/context";
import { SYSTEM_PROMPT, renderSources, renderDataBlock } from "@/lib/rag/prompt";
import {
  streamWithFallback,
  AllModelsFailedError,
} from "@/lib/rag/model-chain";
import { auditAnswer } from "@/lib/rag/audit";
import {
  isAdviceSeeking,
  buildRefusal,
  sanitizeOutput,
  DISCLAIMER_LINE,
} from "@/lib/rag/guardrails";
import { postProcess } from "@/lib/llm/post-process";
import { trimHistory } from "@/lib/llm/budget";
import { getServerEnv } from "@/lib/env";
import { isRateLimited } from "@/lib/rag/rate-limit";
import type { ChatSource, TablesInsert } from "@/types/database";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  symbol: z.string().trim().min(1).max(40),
  message: z.string().trim().min(1).max(1000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      }),
    )
    .max(10)
    .optional()
    .default([]),
});

/** Build the citation metadata for the sources actually cited in the answer. */
function citedSources(
  chunks: RetrievedChunk[],
  answer: string,
): ChatSource[] {
  const out: ChatSource[] = [];
  chunks.forEach((c, i) => {
    const tag = `S${i + 1}`;
    if (answer.includes(`[${tag}]`)) {
      out.push({
        id: tag,
        doc: c.filingTitle ?? c.docType ?? "Filing",
        fiscalYear: c.fiscalYear,
        page: c.page,
        section: c.section,
        snippet: c.content.slice(0, 300),
        url: c.sourceUrl ? `${c.sourceUrl}#page=${c.page ?? 1}` : "",
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
      { error: "Please sign in to chat." },
      { status: 401 },
    );
  }

  const admin = createAdminClient();

  // 3. Look up the stock.
  const { data: stock } = await admin
    .from("stocks")
    .select("id, name")
    .eq("symbol", body.symbol.toUpperCase())
    .maybeSingle();
  if (!stock) {
    return NextResponse.json({ error: "Unknown stock." }, { status: 404 });
  }

  // 4. Shared hourly rate limit (chat + portfolio explainer).
  if (await isRateLimited(admin, user.id)) {
    return NextResponse.json(
      {
        error:
          "You've reached the hourly message limit. Please try again a little later.",
      },
      { status: 429 },
    );
  }

  // Load structured context (DATA block + neutral bullets).
  const ctx = await loadStockContext(stock.id);
  const neutralBullets = ctx?.neutralBullets ?? [];
  const refusal = buildRefusal({ company: stock.name, bullets: neutralBullets });

  // Persist the user message (best-effort).
  await admin.from("chat_messages").insert({
    user_id: user.id,
    stock_id: stock.id,
    role: "user",
    content: body.message,
  } satisfies TablesInsert<"chat_messages">);

  // 5. INTENT GUARD — refuse advice-seeking deterministically, no LLM.
  if (isAdviceSeeking(body.message)) {
    await admin.from("chat_messages").insert({
      user_id: user.id,
      stock_id: stock.id,
      role: "assistant",
      content: refusal,
      sources: [],
    } satisfies TablesInsert<"chat_messages">);
    return streamPlainText(refusal);
  }

  // 6. Retrieve filing chunks.
  let chunks: RetrievedChunk[] = [];
  try {
    chunks = await retrieveChunks(stock.id, body.message);
  } catch (e) {
    console.error("retrieval:", (e as Error).message);
  }

  // If no chunks came back, distinguish "no filings loaded at all" from
  // "nothing relevant to this question" so the user gets a clear message.
  const dataBlock = ctx?.data ?? null;
  if (chunks.length === 0) {
    const { count: filingCount } = await admin
      .from("filings")
      .select("id", { count: "exact", head: true })
      .eq("stock_id", stock.id);
    if ((filingCount ?? 0) === 0) {
      const msg =
        "No filings have been loaded for this company yet, so I can't answer from source documents. An administrator needs to run the ingestion script.";
      await admin.from("chat_messages").insert({
        user_id: user.id,
        stock_id: stock.id,
        role: "assistant",
        content: msg,
        sources: [],
      } satisfies TablesInsert<"chat_messages">);
      return streamPlainText(msg);
    }
  }

  // If nothing relevant AND no structured data, bail with a clean message.
  if (chunks.length === 0 && !dataBlock) {
    const msg =
      "I couldn't find that in the available filings for this company.";
    await admin.from("chat_messages").insert({
      user_id: user.id,
      stock_id: stock.id,
      role: "assistant",
      content: msg,
      sources: [],
    } satisfies TablesInsert<"chat_messages">);
    return streamPlainText(msg);
  }

  // 7. Build the prompt.
  const sourcesText = renderSources(chunks);
  const dataText = dataBlock ? renderDataBlock(dataBlock) : "DATA: (none)";
  // Trim history to a modest token budget (keep the most recent turns) so
  // free-tier tokens-per-minute limits are respected.
  const { RAG_MAX_CONTEXT_TOKENS } = getServerEnv();
  const history = trimHistory(
    (body.history ?? []).slice(-6),
    Math.floor(RAG_MAX_CONTEXT_TOKENS / 3),
  );
  // Valid citation tags for the post-processor (S1..Sn for the chunks given).
  const validTags = chunks.map((_, i) => `S${i + 1}`);

  try {
    // Generate through the Gemini model-fallback chain (429/5xx/timeout → next).
    const result = await streamWithFallback({
      system: SYSTEM_PROMPT,
      messages: [
        ...history.map((h) => ({ role: h.role, content: h.content })),
        {
          role: "user" as const,
          content: `${sourcesText}\n\n${dataText}\n\nQUESTION: ${body.message}`,
        },
      ],
      // POST-PROCESS (open-model safety) + OUTPUT GUARD + fact audit +
      // persistence happen on finish.
      async onFinish({ text }) {
        // 1) Deterministic post-processing: strip <think> blocks, drop citation
        //    tags to sources that were not provided, ensure the disclaimer.
        const processed = postProcess(text, {
          validTags,
          disclaimer: DISCLAIMER_LINE,
        }).text;
        // 2) Advice output guard (replaces with the refusal if it slipped).
        const { text: safe } = sanitizeOutput(processed, refusal);
        const sources = citedSources(chunks, safe);
        // Fact audit: non-blocking for the stream, best-effort. Never rewrites.
        const audit = await auditAnswer(safe, chunks, dataBlock);
        await admin.from("chat_messages").insert({
          user_id: user.id,
          stock_id: stock.id,
          role: "assistant",
          content: safe,
          sources,
          audit,
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

/** Stream a fixed string as a data-stream response (for refusals / fallbacks). */
function streamPlainText(text: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Vercel AI data-stream text part format: 0:"..."
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
