import "server-only";
import { streamText, generateText } from "ai";
import {
  resolveChatChain,
  type ResolvedModel,
} from "@/lib/llm/providers";

/**
 * Provider-agnostic chat model fallback chain.
 *
 * The chain is resolved from env (see src/lib/llm/providers.ts): the Groq-only
 * LLM_CHAT_CHAIN ("groq:...,groq:...") or, when unset, a single-model chain
 * built from GROQ_MODEL. Every entry is a Groq model — the fallback is BETWEEN
 * GROQ MODELS, never between providers. When Groq is not configured the chain
 * is empty and the caller surfaces the existing friendly error.
 *
 * Transient failures (HTTP 429, 5xx, timeouts/aborts, and provider
 * rate-limit / tokens-per-minute messages) advance to the next entry, honoring
 * Retry-After when present. A non-transient failure on an entry is surfaced
 * immediately. If every entry fails transiently (or none is configured) the
 * caller receives AllModelsFailedError and shows the existing friendly error.
 *
 * Adapted from Nipun-AI (MIT License) — the cascading-model idea. See NOTICE.md.
 * Reimplemented on the Vercel AI SDK (no raw fetch, no hard-coded model names).
 */

/**
 * Legacy helper retained for backward compatibility and existing tests: the
 * ordered list of model NAMES in the resolved chain.
 */
export function resolveChatModels(): string[] {
  return resolveChatChain().map((m) => m.model as unknown as string);
}

/** True when an error is transient and worth trying the next entry for. */
export function isTransientError(err: unknown): boolean {
  const e = err as { statusCode?: number; name?: string; message?: string };
  if (e?.statusCode === 429) return true;
  if (typeof e?.statusCode === "number" && e.statusCode >= 500) return true;
  const msg = (e?.message ?? "").toLowerCase();
  if (e?.name === "AbortError" || e?.name === "TimeoutError") return true;
  return /\b(429|timeout|timed out|unavailable|overloaded|503|502|500)\b/.test(
    msg,
  ) || /rate.?limit|tokens per minute|tokens-per-minute|tpm|too many requests|quota/.test(msg);
}

/** Parse a Retry-After value (seconds or HTTP date) from a provider error. */
export function retryAfterMs(err: unknown): number | null {
  const e = err as {
    responseHeaders?: Record<string, string>;
    headers?: Record<string, string>;
    retryAfter?: number | string;
  };
  const headers = e?.responseHeaders ?? e?.headers ?? {};
  const raw =
    headers["retry-after"] ??
    headers["Retry-After"] ??
    (e?.retryAfter as string | number | undefined);
  if (raw == null) return null;
  if (typeof raw === "number") return raw * 1000;
  const asNum = Number(raw);
  if (Number.isFinite(asNum)) return asNum * 1000;
  const asDate = Date.parse(raw);
  if (Number.isFinite(asDate)) return Math.max(0, asDate - Date.now());
  return null;
}

/** Cap on how long we'll actually wait for a Retry-After before moving on. */
const MAX_RETRY_WAIT_MS = 4000;

export class AllModelsFailedError extends Error {
  constructor(
    public readonly lastError: unknown,
    public readonly lastStatusCode?: number,
  ) {
    super("All chat models failed to respond.");
    this.name = "AllModelsFailedError";
  }
}

/** Server-only log of which provider/model answered. Never shown to users. */
function logAnswered(label: string): void {
  console.info(`[model-chain] answered by ${label}`);
}

async function maybeWaitForRetryAfter(err: unknown): Promise<void> {
  const wait = retryAfterMs(err);
  if (wait != null && wait > 0) {
    await new Promise((r) => setTimeout(r, Math.min(wait, MAX_RETRY_WAIT_MS)));
  }
}

type StreamTextOptions = Omit<Parameters<typeof streamText>[0], "model">;

/**
 * Stream a completion, cascading through the resolved provider chain.
 *
 * `streamText` is lazy, so a call can succeed here and still fail while the
 * body streams. To make fallback reliable we probe each model with a tiny
 * `generateText` call first; the first model that answers the probe is used for
 * the real stream. On transient probe failures we advance to the next entry
 * (honoring Retry-After).
 */
// Adapted from Nipun-AI (MIT License). See NOTICE.md.
export async function streamWithFallback(
  options: StreamTextOptions,
): Promise<ReturnType<typeof streamText>> {
  const chain = resolveChatChain();
  let lastErr: unknown;

  for (const entry of chain) {
    try {
      // Cheap liveness probe (bounded tokens) to detect 429/5xx before streaming.
      await generateText({ model: entry.model, prompt: "ping", maxTokens: 1 });
      logAnswered(entry.label);
      return streamText({ model: entry.model, ...options });
    } catch (err) {
      lastErr = err;
      if (isTransientError(err)) {
        await maybeWaitForRetryAfter(err);
        continue; // try next entry
      }
      throw err; // non-transient (e.g. bad request): stop.
    }
  }

  throw new AllModelsFailedError(
    lastErr,
    (lastErr as { statusCode?: number })?.statusCode,
  );
}

/**
 * Non-streaming generation with the same fallback cascade. Used by the fact
 * audit and the portfolio-explain route.
 *
 * An optional `preferred` model (e.g. the resolved audit model) is tried first,
 * then the rest of the chain.
 */
export async function generateWithFallback(
  options: Omit<Parameters<typeof generateText>[0], "model">,
  preferred?: ResolvedModel | null,
): Promise<ReturnType<typeof generateText>> {
  const chain = resolveChatChain();
  const ordered: ResolvedModel[] = preferred
    ? [preferred, ...chain.filter((m) => m.label !== preferred.label)]
    : chain;
  let lastErr: unknown;

  for (const entry of ordered) {
    try {
      const result = await generateText({ model: entry.model, ...options });
      logAnswered(entry.label);
      return result;
    } catch (err) {
      lastErr = err;
      if (isTransientError(err)) {
        await maybeWaitForRetryAfter(err);
        continue;
      }
      throw err;
    }
  }

  throw new AllModelsFailedError(
    lastErr,
    (lastErr as { statusCode?: number })?.statusCode,
  );
}
