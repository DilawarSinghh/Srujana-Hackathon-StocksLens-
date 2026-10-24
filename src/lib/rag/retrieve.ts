import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { embedText } from "@/lib/rag/embeddings";

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
const TOP_K = 8;

/**
 * Retrieve the most relevant filing chunks for a stock + question.
 * Embeds the question, runs match_filing_chunks (top 8), drops low-similarity
 * matches, and joins filing title / source URL / doc metadata.
 */
export async function retrieveChunks(
  stockId: string,
  question: string,
): Promise<RetrievedChunk[]> {
  const embedding = await embedText(question);
  const db = createAdminClient();

  const { data, error } = await db.rpc("match_filing_chunks", {
    query_embedding: embedding,
    match_stock_id: stockId,
    match_count: TOP_K,
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

  return matches.map((m) => {
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
}
