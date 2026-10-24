import "server-only";
import { extractPdfPages } from "@/lib/rag/pdf";
import { chunkPages, buildEmbedText, type Chunk, type Page } from "@/lib/rag/chunking";
import { embedBatch } from "@/lib/rag/embeddings";

/**
 * Shared document-ingest core: extract PDF text → chunk → embed. Used by both
 * the filings ingestion script and the user-upload route so the extraction,
 * chunking, and embedding logic lives in ONE place.
 *
 * The caller owns persistence (filings vs user documents differ), so this
 * returns the chunks aligned with their embeddings plus extraction metadata.
 */

export interface IngestedChunk extends Chunk {
  embedding: number[];
}

export interface IngestResult {
  pageCount: number;
  chunks: IngestedChunk[];
  warnings: string[];
}

export interface IngestMeta {
  /** Company or document name, used in the embedding header for context. */
  company: string;
  docType: string;
  fiscalYear: number | string;
}

/**
 * Extract, chunk, and embed a PDF buffer. Returns [] chunks when the PDF has no
 * extractable text (e.g. scanned images) — the caller decides how to react.
 */
export async function ingestPdf(
  data: Uint8Array,
  meta: IngestMeta,
): Promise<IngestResult> {
  const { pages, warnings } = await extractPdfPages(data);
  const pageInputs: Page[] = pages
    .filter((p) => !p.nearEmpty)
    .map((p) => ({ pageNumber: p.pageNumber, text: p.text }));

  const chunks = chunkPages(pageInputs);
  if (chunks.length === 0) {
    return { pageCount: pages.length, chunks: [], warnings };
  }

  const embedTexts = chunks.map((c) =>
    buildEmbedText({
      company: meta.company,
      docType: meta.docType,
      fiscalYear: meta.fiscalYear,
      section: c.section,
      pageNumber: c.pageNumber,
      content: c.content,
    }),
  );
  const embeddings = await embedBatch(embedTexts, 50);

  const ingested: IngestedChunk[] = chunks.map((c, i) => ({
    ...c,
    embedding: embeddings[i],
  }));

  return { pageCount: pages.length, chunks: ingested, warnings };
}
