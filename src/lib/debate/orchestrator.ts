import "server-only";
import { generateWithFallback, AllModelsFailedError } from "@/lib/rag/model-chain";
import { renderAnalysisData, renderSources } from "@/lib/rag/prompt";
import { containsAdvice } from "@/lib/rag/guardrails";
import type { ChatDataBlock } from "@/lib/rag/context";
import type { RetrievedChunk } from "@/lib/rag/retrieve";
import { parseAgentJson } from "@/lib/debate/parse";
import {
  bullSystemPrompt,
  devilSystemPrompt,
  judgeSystemPrompt,
  focusLine,
} from "@/lib/debate/prompts";
import {
  bullSchema,
  devilSchema,
  judgeSchema,
  type AgentResult,
  type BullOutput,
  type DevilOutput,
  type JudgeOutput,
  type DebateFocus,
} from "@/lib/debate/schema";

/**
 * Server-side orchestration of the three-agent debate.
 *
 * Reuses the existing provider chain (generateWithFallback) so there is NO new
 * AI dependency and NO provider key in the browser. Agents run in dependency
 * order — Bull, then Devil (needs the Bull's claims), then Judge (needs both).
 * A failure in any agent is reported honestly; a downstream agent that can't
 * run without its input is marked failed rather than fabricating a result.
 *
 * `generate` is injectable so tests can drive scripted outputs without touching
 * a real provider (no live quota in unit tests).
 */

export type GenerateFn = (opts: {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
}) => Promise<string>;

/** Default generator: non-streaming call through the provider fallback chain. */
export const defaultGenerate: GenerateFn = async ({ system, messages }) => {
  const result = await generateWithFallback({ system, messages, temperature: 0.4 });
  return result.text;
};

export interface DebateInput {
  data: ChatDataBlock;
  chunks: RetrievedChunk[];
  focus: DebateFocus;
  thesis: string;
}

/** Shared evidence context (DATA + optional SOURCES + focus/thesis framing). */
function evidenceContext(input: DebateInput): string {
  const sources =
    input.chunks.length > 0
      ? `${renderSources(input.chunks)}\n\n`
      : "SOURCES: (no company filings are indexed for this company)\n\n";
  return `${sources}${renderAnalysisData(input.data)}\n\n${focusLine(
    input.focus,
    input.thesis,
  )}`;
}

function failureNote(e: unknown): { error: string; providerFailed: boolean } {
  if (e instanceof AllModelsFailedError) {
    return { error: "The AI service is busy right now.", providerFailed: true };
  }
  return { error: "The agent could not produce a usable response.", providerFailed: false };
}

/**
 * The advice output guard applies to every agent summary/conclusion. A bull/
 * bear debate is prone to tripping it, so we scan the salient free-text fields;
 * if advice language slips in, the agent is treated as failed (we never show
 * disallowed advice). This keeps the existing guardrail authoritative.
 */
function tripsAdviceGuard(texts: (string | undefined)[]): boolean {
  return texts.some((t) => t && containsAdvice(t));
}

export async function runBull(
  input: DebateInput,
  generate: GenerateFn,
): Promise<AgentResult<BullOutput>> {
  try {
    const raw = await generate({
      system: bullSystemPrompt(),
      messages: [{ role: "user", content: evidenceContext(input) }],
    });
    const parsed = parseAgentJson(raw, bullSchema);
    if (!parsed.ok || !parsed.value) {
      return { agent: "bull", status: "failed", output: null, error: parsed.error };
    }
    if (tripsAdviceGuard([parsed.value.summary])) {
      return {
        agent: "bull",
        status: "failed",
        output: null,
        error: "The bull response contained disallowed advice and was withheld.",
      };
    }
    return { agent: "bull", status: "ok", output: parsed.value, error: null };
  } catch (e) {
    const { error, providerFailed } = failureNote(e);
    return { agent: "bull", status: "failed", output: null, error, providerFailed };
  }
}

export async function runDevil(
  input: DebateInput,
  bull: BullOutput,
  generate: GenerateFn,
): Promise<AgentResult<DevilOutput>> {
  try {
    const bullBlock = `BULL CLAIMS (the case to challenge):\n${JSON.stringify({
      summary: bull.summary,
      claims: bull.claims,
    })}`;
    const raw = await generate({
      system: devilSystemPrompt(),
      messages: [
        { role: "user", content: `${evidenceContext(input)}\n\n${bullBlock}` },
      ],
    });
    const parsed = parseAgentJson(raw, devilSchema);
    if (!parsed.ok || !parsed.value) {
      return { agent: "devil", status: "failed", output: null, error: parsed.error };
    }
    if (tripsAdviceGuard([parsed.value.summary])) {
      return {
        agent: "devil",
        status: "failed",
        output: null,
        error: "The devil's-advocate response contained disallowed advice and was withheld.",
      };
    }
    return { agent: "devil", status: "ok", output: parsed.value, error: null };
  } catch (e) {
    const { error, providerFailed } = failureNote(e);
    return { agent: "devil", status: "failed", output: null, error, providerFailed };
  }
}

export async function runJudge(
  input: DebateInput,
  bull: BullOutput,
  devil: DevilOutput,
  generate: GenerateFn,
): Promise<AgentResult<JudgeOutput>> {
  try {
    const debateBlock = `DEBATE TO EVALUATE:\nBULL: ${JSON.stringify({
      summary: bull.summary,
      claims: bull.claims,
    })}\nDEVIL'S ADVOCATE: ${JSON.stringify({
      summary: devil.summary,
      counterarguments: devil.counterarguments,
    })}`;
    const raw = await generate({
      system: judgeSystemPrompt(),
      messages: [
        { role: "user", content: `${evidenceContext(input)}\n\n${debateBlock}` },
      ],
    });
    const parsed = parseAgentJson(raw, judgeSchema);
    if (!parsed.ok || !parsed.value) {
      return { agent: "judge", status: "failed", output: null, error: parsed.error };
    }
    if (tripsAdviceGuard([parsed.value.conclusion])) {
      return {
        agent: "judge",
        status: "failed",
        output: null,
        error: "The judge response contained disallowed advice and was withheld.",
      };
    }
    return { agent: "judge", status: "ok", output: parsed.value, error: null };
  } catch (e) {
    const { error, providerFailed } = failureNote(e);
    return { agent: "judge", status: "failed", output: null, error, providerFailed };
  }
}

export interface OrchestrationOutput {
  bull: AgentResult<BullOutput>;
  devil: AgentResult<DevilOutput>;
  judge: AgentResult<JudgeOutput>;
}

/** Skipped-agent result (dependency upstream failed). Never fabricates output. */
function skipped<T>(
  agent: AgentResult<T>["agent"],
  reason: string,
): AgentResult<T> {
  return { agent, status: "failed", output: null, error: reason };
}

/**
 * Run the full debate in dependency order. The Devil only runs if the Bull
 * produced structured claims; the Judge only runs if BOTH produced output. A
 * partial debate is returned with explicit per-agent failures — the caller must
 * never present it as a completed three-agent evaluation.
 */
export async function runDebate(
  input: DebateInput,
  generate: GenerateFn = defaultGenerate,
): Promise<OrchestrationOutput> {
  const bull = await runBull(input, generate);
  if (bull.status !== "ok" || !bull.output) {
    return {
      bull,
      devil: skipped("devil", "Skipped: the bull case did not complete, so there was nothing to challenge."),
      judge: skipped("judge", "Skipped: the debate was incomplete, so no verdict was produced."),
    };
  }

  const devil = await runDevil(input, bull.output, generate);
  if (devil.status !== "ok" || !devil.output) {
    return {
      bull,
      devil,
      judge: skipped("judge", "Skipped: the challenge did not complete, so no verdict was produced."),
    };
  }

  const judge = await runJudge(input, bull.output, devil.output, generate);
  return { bull, devil, judge };
}
