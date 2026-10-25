import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadStockContext } from "@/lib/rag/context";
import { retrieveChunks, type RetrievedChunk } from "@/lib/rag/retrieve";
import { isRateLimited } from "@/lib/rag/rate-limit";
import { runDebate } from "@/lib/debate/orchestrator";
import { DEBATE_FOCUSES, type DebateResult } from "@/lib/debate/schema";
import type { TablesInsert } from "@/types/database";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({
  symbol: z.string().trim().min(1).max(40),
  thesis: z.string().trim().max(500).optional().default(""),
  focus: z.enum(DEBATE_FOCUSES).optional().default("overall"),
});

/**
 * POST /api/debate — run the three-agent investment debate for one stock.
 *
 * Mirrors the chat route's security posture: login required (401), server-side
 * stock lookup (404), shared hourly AI rate limit (429). The canonical snapshot
 * comes from the SAME deterministic context service the chat uses
 * (loadStockContext) — the model never computes scores or invents data.
 *
 * The debate is returned to the client for the session; it is not persisted in
 * the MVP (see the feature README). We record one lightweight user message in
 * chat_messages so the debate participates in the existing abuse rate limit.
 */
export async function POST(request: Request) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Require login.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Please sign in to run a debate." },
      { status: 401 },
    );
  }

  const admin = createAdminClient();

  // Server-side stock lookup: the debate is always grounded in THIS record.
  const { data: stock } = await admin
    .from("stocks")
    .select("id, name, symbol")
    .eq("symbol", body.symbol.toUpperCase())
    .maybeSingle();
  if (!stock) {
    return NextResponse.json({ error: "Unknown stock." }, { status: 404 });
  }

  // Shared hourly AI budget (chat + explainer + debate).
  if (await isRateLimited(admin, user.id)) {
    return NextResponse.json(
      {
        error:
          "You've reached the hourly AI limit. Please try again a little later.",
      },
      { status: 429 },
    );
  }

  // Canonical snapshot — deterministic, same source the chat trusts.
  const ctx = await loadStockContext(stock.id);
  if (!ctx?.data) {
    return NextResponse.json(
      { error: `Not enough stored data for ${stock.name} to run a debate yet.` },
      { status: 422 },
    );
  }

  // Optional supporting filing excerpts (best-effort; absence is fine).
  let chunks: RetrievedChunk[] = [];
  try {
    const query = body.thesis
      ? body.thesis
      : `investment thesis strengths risks ${stock.name}`;
    chunks = await retrieveChunks(stock.id, query);
  } catch (e) {
    console.error("debate retrieval:", (e as Error).message);
  }

  // Meter this run against the shared rate limit by recording the request.
  await admin.from("chat_messages").insert({
    user_id: user.id,
    stock_id: stock.id,
    role: "user",
    content: `[debate:${body.focus}] ${body.thesis || "(no thesis)"}`.slice(0, 1000),
    mode: "analysis",
  } satisfies TablesInsert<"chat_messages">);

  const runId = crypto.randomUUID();

  try {
    const { bull, devil, judge } = await runDebate({
      data: ctx.data,
      chunks,
      focus: body.focus,
      thesis: body.thesis,
    });

    const result: DebateResult = { runId, bull, devil, judge };
    return NextResponse.json({
      runId,
      stock: {
        symbol: stock.symbol,
        name: stock.name,
        exchange: ctx.data.exchange,
        sector: ctx.data.sector,
        as_of: ctx.data.as_of,
      },
      snapshot: ctx.data,
      citations: chunks.map((c, i) => ({
        id: `S${i + 1}`,
        doc: c.filingTitle ?? c.docType ?? "Filing",
        fiscalYear: c.fiscalYear,
        page: c.page,
        section: c.section,
        snippet: c.content.slice(0, 300),
        url: c.sourceUrl ? `${c.sourceUrl}#page=${c.page ?? 1}` : "",
      })),
      debate: result,
    });
  } catch (e) {
    console.error("debate:", (e as Error).message);
    return NextResponse.json(
      { error: "Something went wrong running the debate. Please try again." },
      { status: 500 },
    );
  }
}
