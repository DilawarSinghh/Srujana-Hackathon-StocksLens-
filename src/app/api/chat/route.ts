import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { retrieveChunks, type RetrievedChunk } from "@/lib/rag/retrieve";
import { loadStockContext } from "@/lib/rag/context";
import {
  SYSTEM_PROMPT,
  STOCK_ANALYSIS_SYSTEM_PROMPT,
  ANALYSIS_DISCLAIMER,
  renderSources,
  renderAnalysisData,
} from "@/lib/rag/prompt";
import {
  streamWithFallback,
  AllModelsFailedError,
} from "@/lib/rag/model-chain";
import { auditAnswer } from "@/lib/rag/audit";
import {
  isAdviceSeeking,
  buildRefusal,
  ensureDisclaimer,
  containsAdvice,
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
  // "analysis" (default): database-grounded stock analysis, useful even with no
  // filings. "filings": document-grounded, requires indexed filings.
  mode: z.enum(["analysis", "filings"]).optional().default("analysis"),
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

  // 3. Look up the stock through the authorized server-side layer. The answer
  //    is always grounded in THIS record, never an arbitrary client identifier.
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

  // Persist the user message (best-effort), tagged with the active mode so the
  // Stock Analysis and Filings transcripts stay separate.
  await admin.from("chat_messages").insert({
    user_id: user.id,
    stock_id: stock.id,
    role: "user",
    content: body.message,
    mode: body.mode,
  } satisfies TablesInsert<"chat_messages">);

  // Helper to persist an assistant message and stream it as a fixed response.
  const reply = async (content: string, sources: ChatSource[] = []) => {
    await admin.from("chat_messages").insert({
      user_id: user.id,
      stock_id: stock.id,
      role: "assistant",
      content,
      sources,
      mode: body.mode,
    } satisfies TablesInsert<"chat_messages">);
    return streamPlainText(content);
  };

  // 5. INTENT GUARD — refuse advice-seeking deterministically, no LLM.
  if (isAdviceSeeking(body.message)) {
    return reply(refusal);
  }

  // 6. Retrieve filing chunks (both modes use them when present).
  let chunks: RetrievedChunk[] = [];
  try {
    chunks = await retrieveChunks(stock.id, body.message);
  } catch (e) {
    console.error("retrieval:", (e as Error).message);
  }

  const dataBlock = ctx?.data ?? null;

  // 7a. FILINGS mode: document-grounded. Report clearly when nothing is indexed
  //     instead of pretending to have read a filing.
  if (body.mode === "filings") {
    if (chunks.length === 0) {
      const { count: filingCount } = await admin
        .from("filings")
        .select("id", { count: "exact", head: true })
        .eq("stock_id", stock.id);
      const msg =
        (filingCount ?? 0) === 0
          ? `No company filings are currently indexed for ${stock.name}, so I can't answer from source documents. Switch to Stock Analysis to ask about its fundamentals, score, and price performance using available StockLens data.`
          : `I couldn't find anything relevant to that in the filings indexed for ${stock.name}. Try rephrasing, or switch to Stock Analysis for a data-based answer.`;
      return reply(ensureDisclaimer(msg));
    }
    return runModel({
      admin,
      userId: user.id,
      stockId: stock.id,
      mode: "filings",
      system: SYSTEM_PROMPT,
      userContent: `${renderSources(chunks)}\n\nQUESTION: ${body.message}`,
      chunks,
      dataBlock,
      disclaimer: DISCLAIMER_LINE,
      refusal,
      history: body.history ?? [],
    });
  }

  // 7b. STOCK ANALYSIS mode (default): useful with just database data. Filings,
  //     when present, are included as optional supporting sources.
  if (!dataBlock) {
    return reply(
      ensureDisclaimer(
        `I don't have enough stored data for ${stock.name} yet to analyse it.`,
      ),
    );
  }

  const sourcesText =
    chunks.length > 0
      ? `${renderSources(chunks)}\n\n`
      : "SOURCES: (no company filings are indexed for this company)\n\n";

  return runModel({
    admin,
    userId: user.id,
    stockId: stock.id,
    mode: "analysis",
    system: STOCK_ANALYSIS_SYSTEM_PROMPT,
    userContent: `${sourcesText}${renderAnalysisData(dataBlock)}\n\nQUESTION: ${body.message}`,
    chunks,
    dataBlock,
    disclaimer: ANALYSIS_DISCLAIMER,
    refusal,
    history: body.history ?? [],
  });
}

interface RunModelParams {
  admin: ReturnType<typeof createAdminClient>;
  userId: string;
  stockId: string;
  mode: "analysis" | "filings";
  system: string;
  userContent: string;
  chunks: RetrievedChunk[];
  dataBlock: unknown;
  disclaimer: string;
  refusal: string;
  history: { role: "user" | "assistant"; content: string }[];
}

/** Generate through the model-fallback chain, guard, audit, and persist. */
async function runModel(p: RunModelParams): Promise<Response> {
  const { RAG_MAX_CONTEXT_TOKENS } = getServerEnv();
  const history = trimHistory(
    p.history.slice(-6),
    Math.floor(RAG_MAX_CONTEXT_TOKENS / 3),
  );
  const validTags = p.chunks.map((_, i) => `S${i + 1}`);

  try {
    const result = await streamWithFallback({
      system: p.system,
      messages: [
        ...history.map((h) => ({ role: h.role, content: h.content })),
        { role: "user" as const, content: p.userContent },
      ],
      async onFinish({ text }) {
        // 1) Deterministic post-processing: strip <think> blocks, drop citation
        //    tags to sources that were not provided, ensure the disclaimer.
        const processed = postProcess(text, {
          validTags,
          disclaimer: p.disclaimer,
        }).text;
        // 2) Advice output guard: replace with the refusal if advice slipped
        //    in. postProcess already guaranteed the mode's disclaimer, so we
        //    only swap in the refusal here (no second disclaimer appended).
        const safe = containsAdvice(processed) ? p.refusal : processed;
        const sources = citedSources(p.chunks, safe);
        // Fact audit: best-effort, never rewrites.
        const audit = await auditAnswer(safe, p.chunks, p.dataBlock);
        await p.admin.from("chat_messages").insert({
          user_id: p.userId,
          stock_id: p.stockId,
          role: "assistant",
          content: safe,
          sources,
          audit,
          mode: p.mode,
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
