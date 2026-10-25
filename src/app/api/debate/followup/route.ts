import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadStockContext } from "@/lib/rag/context";
import { retrieveChunks, type RetrievedChunk } from "@/lib/rag/retrieve";
import { isRateLimited } from "@/lib/rag/rate-limit";
import { renderAnalysisData, renderSources } from "@/lib/rag/prompt";
import { streamWithFallback, AllModelsFailedError } from "@/lib/rag/model-chain";
import { classifyLlmError, classifyModelsFailed } from "@/lib/llm/errors";
import {
  isAdviceSeeking,
  buildRefusal,
  ensureDisclaimer,
  containsAdvice,
} from "@/lib/rag/guardrails";
import { postProcess } from "@/lib/llm/post-process";
import { trimHistory } from "@/lib/llm/budget";
import { getServerEnv } from "@/lib/env";
import { followupSystemPrompt, DEBATE_DISCLAIMER } from "@/lib/debate/prompts";
import type { TablesInsert } from "@/types/database";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  symbol: z.string().trim().min(1).max(40),
  message: z.string().trim().min(1).max(1000),
  /** Bounded debate context from the client: compact summaries, not the whole debate. */
  context: z.string().max(8000).optional().default(""),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      }),
    )
    .max(8)
    .optional()
    .default([]),
});

/** Stream a fixed string as a Vercel AI data-stream response (for refusals). */
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

/**
 * POST /api/debate/followup — ask a stock-aware follow-up grounded in the
 * canonical snapshot + bounded debate context. Streams like the chat route so
 * the client reuses the same data-stream reader.
 */
export async function POST(request: Request) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: stock } = await admin
    .from("stocks")
    .select("id, name")
    .eq("symbol", body.symbol.toUpperCase())
    .maybeSingle();
  if (!stock) {
    return NextResponse.json({ error: "Unknown stock." }, { status: 404 });
  }

  if (await isRateLimited(admin, user.id)) {
    return NextResponse.json(
      { error: "You've reached the hourly AI limit. Please try again a little later." },
      { status: 429 },
    );
  }

  const ctx = await loadStockContext(stock.id);
  const neutralBullets = ctx?.neutralBullets ?? [];
  const refusal = `${buildRefusal({ company: stock.name, bullets: neutralBullets })}\n\n${DEBATE_DISCLAIMER}`;

  // Record the follow-up for the rate-limit budget.
  await admin.from("chat_messages").insert({
    user_id: user.id,
    stock_id: stock.id,
    role: "user",
    content: body.message,
    mode: "analysis",
  } satisfies TablesInsert<"chat_messages">);

  // Deterministic advice refusal — no model call.
  if (isAdviceSeeking(body.message)) {
    return streamPlainText(refusal);
  }

  if (!ctx?.data) {
    return streamPlainText(
      ensureDisclaimer(`I don't have enough stored data for ${stock.name} to answer that.`),
    );
  }

  // Fresh filing excerpts for the specific follow-up (best-effort).
  let chunks: RetrievedChunk[] = [];
  try {
    chunks = await retrieveChunks(stock.id, body.message);
  } catch (e) {
    console.error("followup retrieval:", (e as Error).message);
  }

  const sourcesText =
    chunks.length > 0
      ? `${renderSources(chunks)}\n\n`
      : "SOURCES: (no company filings are indexed for this company)\n\n";

  const debateContext = body.context
    ? `PRIOR DEBATE CONTEXT (reference, already shown to the user):\n${body.context}\n\n`
    : "";

  const { RAG_MAX_CONTEXT_TOKENS } = getServerEnv();
  const history = trimHistory(
    body.history.slice(-6),
    Math.floor(RAG_MAX_CONTEXT_TOKENS / 3),
  );
  const validTags = chunks.map((_, i) => `S${i + 1}`);

  const userContent = `${sourcesText}${renderAnalysisData(ctx.data)}\n\n${debateContext}FOLLOW-UP QUESTION: ${body.message}`;

  try {
    const result = await streamWithFallback({
      system: followupSystemPrompt(),
      messages: [
        ...history.map((h) => ({ role: h.role, content: h.content })),
        { role: "user" as const, content: userContent },
      ],
      async onFinish({ text }) {
        const processed = postProcess(text, {
          validTags,
          disclaimer: DEBATE_DISCLAIMER,
        }).text;
        const safe = containsAdvice(processed) ? refusal : processed;
        await admin.from("chat_messages").insert({
          user_id: user.id,
          stock_id: stock.id,
          role: "assistant",
          content: safe,
          mode: "analysis",
        } satisfies TablesInsert<"chat_messages">);
      },
    });
    return result.toDataStreamResponse();
  } catch (e) {
    const c =
      e instanceof AllModelsFailedError
        ? classifyModelsFailed(e.lastError, e.lastStatusCode, e.retryAfterMs)
        : classifyLlmError(e);
    console.error(`[debate/followup] llm error (${c.kind}):`, (e as Error).message);
    return NextResponse.json(
      { error: c.message, code: c.code, retryable: c.retryable },
      { status: c.status },
    );
  }
}
