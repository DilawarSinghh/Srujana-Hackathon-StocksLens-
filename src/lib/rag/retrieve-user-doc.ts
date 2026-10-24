import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { embedText } from "@/lib/rag/embeddings";
import type { RetrievedChunk } from "@/lib/rag/retrieve";

const SIMILARITY_FLOOR = 0.5;
const TOP_K = 8;

/**
 * Retrieve the most relevant chunks of ONE user document for a question.
 * Mirrors retrieveChunks but calls match_user_document_chunks, which enforces
 * auth.uid() ownership. Must be called with a USER-SCOPED Supabase client (not
 * the admin client) so RLS + the function's user_id predicate both apply.
 */
export async function retrieveUserDocChunks(
  supabase: SupabaseClient<Database>,
  documentId: string,
  question: string,
): Promise<RetrievedChunk[]> {
  const embedding = await embedText(question);

  const { data, error } = await supabase.rpc("match_user_document_chunks", {
    query_embedding: embedding,
    match_document_id: documentId,
    match_count: TOP_K,
  });

  if (error) {
    console.error("match_user_document_chunks:", error.message);
    return [];
  }

  return (data ?? [])
    .filter((m) => m.similarity >= SIMILARITY_FLOOR)
    .map((m) => ({
      id: m.id,
      filingId: m.document_id,
      page: m.page_number,
      section: m.section,
      content: m.content ?? "",
      similarity: m.similarity,
      filingTitle: null,
      sourceUrl: null,
      docType: "user document",
      fiscalYear: null,
    }));
}
