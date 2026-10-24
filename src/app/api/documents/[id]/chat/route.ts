import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { retrieveUserDocChunks } from "@/lib/rag/retrieve-user-doc";
import { SYSTEM_PROMPT, renderSources } from "@/lib/rag/prompt";
import { streamWithFallback, AllModelsFailedError } from "@/lib/rag/model-chain";
import { isAdviceSeeking, buildRefusal, sanitizeOutput } from "@/lib/rag/guardrails";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const idSchema = z.string().uuid();
const bodySchema = z.object({
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

/** Stream a fixed string as a Vercel AI data-stream response. */
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
 * POST /api/documents/[id]/chat — chat grounded in ONE of the user's uploaded
 * documents. Same system prompt, guards, citations, and model fallback as the
 * stock chat, but retrieval is restricted to the caller's chunks (RLS + the
 * match function's auth.uid() predicate). Uploaded text is treated as untrusted.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

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
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  // Confirm the document exists, is ready, and belongs to the user.
  const { data: doc } = await supabase
    .from("user_documents")
    .select("id, filename, status")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!doc) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (doc.status !== "ready") {
    return NextResponse.json(
      { error: "This document is still processing." },
      { status: 409 },
    );
  }

  const refusal = buildRefusal({ company: doc.filename, bullets: [] });

  // INTENT GUARD (pre-LLM, deterministic).
  if (isAdviceSeeking(body.message)) {
    return streamPlainText(refusal);
  }

  // Retrieve from this user's document chunks only.
  const chunks = await retrieveUserDocChunks(supabase, id, body.message);
  if (chunks.length === 0) {
    return streamPlainText(
      "I couldn't find that in this document.",
    );
  }

  const sourcesText = renderSources(chunks);
  const history = body.history.slice(-6);

  try {
    const result = await streamWithFallback({
      system: SYSTEM_PROMPT,
      messages: [
        ...history.map((h) => ({ role: h.role, content: h.content })),
        {
          role: "user" as const,
          content: `${sourcesText}\n\nDATA: (none)\n\nQUESTION: ${body.message}`,
        },
      ],
      // OUTPUT GUARD on finish is not persisted (document chat is ephemeral);
      // the streamed text is the raw model text, so we also re-guard client-side
      // by relying on the same deterministic patterns server-side below.
    });

    // Wrap the stream to apply the output guard to the full text. Since the
    // answer is not persisted, we transform the final text through sanitizeOutput
    // only when it would otherwise leak advice; streaming tokens are passed
    // through, and a guarded replacement is appended if advice is detected.
    return guardStream(result.toDataStreamResponse(), refusal);
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

/**
 * Buffer the data-stream text parts, run the output guard on the complete
 * answer, and emit the guarded result. Keeps the same data-stream wire format
 * the client already parses.
 */
function guardStream(upstream: Response, refusal: string): Response {
  const reader = upstream.body?.getReader();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      if (!reader) {
        controller.close();
        return;
      }
      let raw = "";
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          if (line.startsWith("0:")) {
            try {
              raw += JSON.parse(line.slice(2)) as string;
            } catch {
              /* ignore partial */
            }
          }
        }
      }
      const { text: safe } = sanitizeOutput(raw, refusal);
      controller.enqueue(encoder.encode(`0:${JSON.stringify(safe)}\n`));
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
