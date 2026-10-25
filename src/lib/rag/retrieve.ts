import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { embeddings } from "@/lib/llm/embeddings";
import { selectChunks } from "@/lib/llm/budget";
import { getServerEnv } from "@/lib/env";

export interface RetrievedChunk {
  id: string;
  filingId: string;
  page: number | null;
  section: string | null;
  content: string;
  similarity: number;
  filingTitle: string | null;
  sourceUrl: string | null;
  docType: string | null;
  fiscalYear: number | null;
}

const SIMILARITY_FLOOR = 0.5;
// Pull a few extra candidates from pgvector so the token budget has room to
// pick the best ones; the final count is capped by RAG_TOP_K below.
const CANDIDATE_MULTIPLIER = 2;

/**
 * Retrieve the most relevant filing chunks for a stock + question.
 *
 * Embeds the question, runs match_filing_chunks, drops low-similarity matches,
 * joins filing metadata, then applies the token budget (RAG_TOP_K chunks,
 * per-chunk char cap, RAG_MAX_CONTEXT_TOKENS overall) to keep the prompt within
 * free-tier tokens-per-minute limits.
 */
export async function retrieveChunks(
  stockId: string,
  question: string,
): Promise<RetrievedChunk[]> {
  const { RAG_TOP_K, RAG_MAX_CONTEXT_TOKENS } = getServerEnv();
  const embedding = await embeddings.embedText(question);
  const db = createAdminClient();

  const { data, error } = await db.rpc("match_filing_chunks", {
    query_embedding: embedding,
    match_stock_id: stockId,
    match_count: RAG_TOP_K * CANDIDATE_MULTIPLIER,
  });

  if (error) {
    console.error("match_filing_chunks:", error.message);
    return [];
  }

  const matches = (data ?? []).filter((m) => m.similarity >= SIMILARITY_FLOOR);
  if (matches.length === 0) return [];

  // Join filing metadata for the matched filings.
  const filingIds = [...new Set(matches.map((m) => m.filing_id))];
  const { data: filings } = await db
    .from("filings")
    .select("id, title, source_url, doc_type, fiscal_year")
    .in("id", filingIds);

  const filingById = new Map((filings ?? []).map((f) => [f.id, f]));

  const mapped: RetrievedChunk[] = matches.map((m) => {
    const f = filingById.get(m.filing_id);
    return {
      id: m.id,
      filingId: m.filing_id,
      page: m.page_number,
      section: m.section,
      content: m.content ?? "",
      similarity: m.similarity,
      filingTitle: f?.title ?? null,
      sourceUrl: f?.source_url ?? null,
      docType: f?.doc_type ?? null,
      fiscalYear: f?.fiscal_year ?? null,
    };
  });

  // Apply the token budget: keep the highest-similarity chunks, cap each
  // chunk's characters, and stop once the running token estimate is exhausted.
  const maxCharsPerChunk = Math.max(
    800,
    Math.floor((RAG_MAX_CONTEXT_TOKENS * 4) / RAG_TOP_K),
  );
  return selectChunks(mapped, {
    topK: RAG_TOP_K,
    maxContextTokens: RAG_MAX_CONTEXT_TOKENS,
    maxCharsPerChunk,
  });
}
