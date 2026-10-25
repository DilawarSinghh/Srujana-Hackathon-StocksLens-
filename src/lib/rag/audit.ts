import "server-only";
import { z } from "zod";
import { generateWithFallback } from "@/lib/rag/model-chain";
import { resolveAuditModel } from "@/lib/llm/providers";
import type { RetrievedChunk } from "@/lib/rag/retrieve";
import type { AuditResult, AuditClaim } from "@/types/database";

/**
 * Post-answer fact audit. After the assistant answer is generated and guarded,
 * one cheap verification call (same Gemini provider, via the fallback chain)
 * labels each factual sentence against the cited SOURCES:
 *   - grounded:     supported by the provided sources
 *   - unverifiable: a factual claim not supported by the sources
 *   - not_a_claim:  not a verifiable factual statement (disclaimer, framing, etc.)
 *
 * The answer is NEVER rewritten. On any failure/timeout this returns null and
 * the caller shows the answer without a badge.
 *
 * Adapted from Nipun-AI (MIT License) — the grounded/speculative claim-audit
 * idea. See NOTICE.md. Reimplemented on our RAG sources + Gemini (no Cohere).
 */

const auditSchema = z.object({
  claims: z
    .array(
      z.object({
        sentence: z.string().min(1).max(500),
        status: z.enum(["grounded", "unverifiable", "not_a_claim"]),
      }),
    )
    .max(40),
});

const AUDIT_TIMEOUT_MS = 12_000;

function buildSourcesBlock(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "(no sources)";
  return chunks
    .map((c, i) => `[S${i + 1}] ${c.content.slice(0, 600)}`)
    .join("\n\n");
}

// Adapted from Nipun-AI (MIT License). See NOTICE.md.
export async function auditAnswer(
  answer: string,
  chunks: RetrievedChunk[],
  dataBlock: unknown,
): Promise<AuditResult | null> {
  if (!answer.trim()) return null;

  const sources = buildSourcesBlock(chunks);
  const data =
    dataBlock != null ? JSON.stringify(dataBlock).slice(0, 2000) : "(none)";

  const prompt = `You are a strict fact auditor. Classify each factual sentence of the ANSWER against the SOURCES and DATA below.

Return ONLY JSON: {"claims":[{"sentence":"<verbatim sentence>","status":"grounded|unverifiable|not_a_claim"}]}

Rules:
- "grounded": the sentence's facts/numbers are supported by SOURCES or DATA.
- "unverifiable": a factual claim NOT supported by SOURCES or DATA.
- "not_a_claim": not a verifiable fact (framing, disclaimer, a question, a definition).
- Use the sentence text verbatim. Do not invent sentences. Do not rewrite the answer.

SOURCES:
${sources}

DATA:
${data}

ANSWER:
${answer}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AUDIT_TIMEOUT_MS);
  try {
    const { text } = await generateWithFallback(
      {
        prompt,
        temperature: 0,
        // Small output cap: the audit only emits short verbatim sentences.
        maxTokens: 1200,
        abortSignal: controller.signal,
      },
      resolveAuditModel(),
    );

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = auditSchema.safeParse(JSON.parse(jsonMatch[0]));
    if (!parsed.success) return null;

    const claims: AuditClaim[] = parsed.data.claims;
    const groundedCount = claims.filter((c) => c.status === "grounded").length;
    const unverifiableCount = claims.filter(
      (c) => c.status === "unverifiable",
    ).length;
    return { claims, groundedCount, unverifiableCount };
  } catch {
    return null; // audit failed/timed out — caller shows answer without a badge
  } finally {
    clearTimeout(timer);
  }
}
