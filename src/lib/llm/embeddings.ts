import "server-only";
import {
  embedText as geminiEmbedText,
  embedBatch as geminiEmbedBatch,
} from "@/lib/rag/embeddings";

/**
 * Embeddings provider interface.
 *
 * Embeddings stay on Gemini (GEMINI_EMBED_MODEL, 768 dims) because the pgvector
 * column is sized for 768 dimensions and all stored vectors were produced by
 * that model. Switching embedding providers would require re-embedding every
 * chunk and changing the column, so that is intentionally OUT OF SCOPE here.
 *
 * This wrapper exists so that swapping the embeddings provider later is a
 * one-line change (point `embeddings` at a different implementation) instead of
 * touching every call site. Retrieval and ingestion should import from here.
 */
export interface EmbeddingsProvider {
  /** Embedding vector dimensionality (must match the pgvector column). */
  readonly dimensions: number;
  /** Embed a single string. */
  embedText(text: string): Promise<number[]>;
  /** Embed many strings; output aligned with input order. */
  embedBatch(texts: string[], batchSize?: number): Promise<number[][]>;
}

/** The active Gemini-backed embeddings provider. */
export const geminiEmbeddings: EmbeddingsProvider = {
  dimensions: 768,
  embedText: geminiEmbedText,
  embedBatch: geminiEmbedBatch,
};

/**
 * The embeddings provider used across the app. Change this single binding (and
 * re-embed + resize the pgvector column) to switch providers later.
 */
export const embeddings: EmbeddingsProvider = geminiEmbeddings;
