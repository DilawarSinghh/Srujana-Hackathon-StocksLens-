import "server-only";
import { google } from "@ai-sdk/google";
import { embedMany, embed } from "ai";
import { getServerEnv } from "@/lib/env";

/**
 * Gemini embeddings via the Vercel AI SDK. Server/scripts only.
 * Model and dimensions come from env (GEMINI_EMBED_MODEL, EMBED_DIMENSIONS).
 */

function embeddingModel() {
  const { GEMINI_EMBED_MODEL } = getServerEnv();
  return google.textEmbeddingModel(GEMINI_EMBED_MODEL);
}

async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  attempts = 3,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const waitMs = 1000 * 2 ** i;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
  }
  throw new Error(`${label} failed after ${attempts} attempts: ${lastErr}`);
}

/** Embed a single string (e.g. a user question). */
export async function embedText(text: string): Promise<number[]> {
  const { embedding } = await withRetry(
    () => embed({ model: embeddingModel(), value: text }),
    "embed",
  );
  return embedding;
}

/**
 * Embed many strings in batches of ~50 with retry/backoff.
 * Returns embeddings aligned with the input order.
 */
export async function embedBatch(
  texts: string[],
  batchSize = 50,
): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const { embeddings } = await withRetry(
      () => embedMany({ model: embeddingModel(), values: batch }),
      `embedBatch[${i}-${i + batch.length}]`,
    );
    out.push(...embeddings);
  }
  return out;
}
