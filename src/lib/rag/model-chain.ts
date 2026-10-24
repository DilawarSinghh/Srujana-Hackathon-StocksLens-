import "server-only";
import { streamText, generateText } from "ai";
import { google } from "@ai-sdk/google";
import { getServerEnv } from "@/lib/env";

/**
 * Gemini model fallback chain.
 *
 * Reads GEMINI_CHAT_MODELS (comma-separated, ordered) and always appends
 * GEMINI_CHAT_MODEL as the final fallback. Transient failures (HTTP 429, 5xx,
 * or timeouts/aborts) advance to the next model; a non-transient failure on the
 * last model is surfaced to the caller.
 *
 * Adapted from Nipun-AI (MIT License) — the cascading-model idea. See NOTICE.md.
 * Reimplemented on the Vercel AI SDK (no raw fetch, no hard-coded model names).
 */

/** Resolve the ordered, de-duplicated list of chat model names from env. */
export function resolveChatModels(): string[] {
  const { GEMINI_CHAT_MODEL, GEMINI_CHAT_MODELS } = getServerEnv();
  const list = (GEMINI_CHAT_MODELS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  list.push(GEMINI_CHAT_MODEL); // always the final fallback
  return [...new Set(list)];
}

/** True when an error is transient and worth trying the next model for. */
export function isTransientError(err: unknown): boolean {
  const e = err as { statusCode?: number; name?: string; message?: string };
  if (e?.statusCode === 429) return true;
  if (typeof e?.statusCode === "number" && e.statusCode >= 500) return true;
  const msg = (e?.message ?? "").toLowerCase();
  if (e?.name === "AbortError" || e?.name === "TimeoutError") return true;
  return /\b(429|timeout|timed out|unavailable|overloaded|503|502|500)\b/.test(
    msg,
  );
}

export class AllModelsFailedError extends Error {
  constructor(
    public readonly lastError: unknown,
    public readonly lastStatusCode?: number,
  ) {
    super("All chat models failed to respond.");
    this.name = "AllModelsFailedError";
  }
}

type StreamTextOptions = Omit<Parameters<typeof streamText>[0], "model">;

/**
 * Stream a completion, cascading through the resolved model chain.
 *
 * `streamText` is lazy, so a call can succeed here and still fail while the body
 * streams. To make fallback reliable we probe each model with a tiny
 * `generateText` call first; the first model that answers the probe is used for
 * the real stream. On transient probe failures we advance to the next model.
 */
export async function streamWithFallback(
  options: StreamTextOptions,
): Promise<ReturnType<typeof streamText>> {
  const models = resolveChatModels();
  let lastErr: unknown;

  for (const modelName of models) {
    try {
      // Cheap liveness probe (bounded tokens) to detect 429/5xx before streaming.
      await generateText({
        model: google(modelName),
        prompt: "ping",
        maxTokens: 1,
      });
      return streamText({ model: google(modelName), ...options });
    } catch (err) {
      lastErr = err;
      if (isTransientError(err)) continue; // try next model
      // Non-transient (e.g. bad request): no point trying other models.
      throw err;
    }
  }

  const statusCode = (lastErr as { statusCode?: number })?.statusCode;
  throw new AllModelsFailedError(lastErr, statusCode);
}

/**
 * Non-streaming generation with the same fallback cascade. Used by the fact
 * audit (a single cheap verification call).
 */
export async function generateWithFallback(
  options: Omit<Parameters<typeof generateText>[0], "model">,
): Promise<ReturnType<typeof generateText>> {
  const models = resolveChatModels();
  let lastErr: unknown;

  for (const modelName of models) {
    try {
      return await generateText({ model: google(modelName), ...options });
    } catch (err) {
      lastErr = err;
      if (isTransientError(err)) continue;
      throw err;
    }
  }

  const statusCode = (lastErr as { statusCode?: number })?.statusCode;
  throw new AllModelsFailedError(lastErr, statusCode);
}
