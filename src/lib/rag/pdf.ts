import "server-only";

/**
 * PDF text extraction using pdfjs-dist (legacy build for Node). Shared by the
 * filings ingestion script and the user-upload route (Node runtime only).
 * Extracts text page by page, keeping true 1-based page numbers.
 */

export interface ExtractedPage {
  pageNumber: number;
  text: string;
  nearEmpty: boolean;
}

export interface ExtractResult {
  pages: ExtractedPage[];
  warnings: string[];
}

/** Extract text from a PDF buffer, page by page. */
export async function extractPdfPages(data: Uint8Array): Promise<ExtractResult> {
  // Legacy build works in Node without a DOM. Dynamic import keeps it out of
  // any client bundle and works in both tsx scripts and the Node route runtime.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const warnings: string[] = [];
  const loadingTask = pdfjs.getDocument({
    data,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const doc = await loadingTask.promise;

  const pages: ExtractedPage[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((item: any) => (typeof item.str === "string" ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    const nearEmpty = text.length < 40;
    if (nearEmpty) {
      warnings.push(`Page ${pageNumber} is near-empty (possibly scanned/image).`);
    }
    pages.push({ pageNumber, text, nearEmpty });
    page.cleanup();
  }

  await doc.destroy();
  return { pages, warnings };
}
