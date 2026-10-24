/**
 * Pure text-processing helpers for filing ingestion: section detection and
 * page-aware chunking. No I/O, no LLM — fully testable.
 */

/** ~4 chars per token heuristic. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Known filing sections and the heading patterns that identify them. */
// `APO` matches a straight or curly apostrophe (PDF fonts often use curly).
const APO = "['\u2018\u2019]?";
const SECTION_PATTERNS: { section: string; pattern: RegExp }[] = [
  { section: "Management Discussion and Analysis", pattern: /management\s+discussion\s+and\s+analysis|md&a|md & a/i },
  { section: "Independent Auditor's Report", pattern: new RegExp(`(independent\\s+)?auditor${APO}s?\\s+report`, "i") },
  { section: "Balance Sheet", pattern: /balance\s+sheet|statement\s+of\s+financial\s+position/i },
  { section: "Notes to Financial Statements", pattern: /notes\s+to\s+(the\s+)?(consolidated\s+|standalone\s+)?financial\s+statements/i },
  { section: "Directors' Report", pattern: new RegExp(`(directors${APO}s?|board${APO}s?)\\s+report`, "i") },
  { section: "Corporate Governance", pattern: /(report\s+on\s+)?corporate\s+governance/i },
  { section: "Risk Management", pattern: /risk\s+management|risk\s+factors/i },
];

/**
 * Detect the section a page belongs to from its text (heading heuristics).
 * Returns null when no known heading is present near the top of the page.
 * Only the first ~400 chars are inspected (headings appear near the top).
 */
export function detectSection(pageText: string): string | null {
  const head = pageText.slice(0, 400);
  for (const { section, pattern } of SECTION_PATTERNS) {
    if (pattern.test(head)) return section;
  }
  return null;
}

/** A page of extracted text with its true 1-based page number. */
export interface Page {
  pageNumber: number;
  text: string;
}

export interface Chunk {
  content: string;
  pageNumber: number;
  section: string | null;
  hasTable: boolean;
  tokenCount: number;
}

const DEFAULT_TARGET_TOKENS = 800;
const DEFAULT_OVERLAP_TOKENS = 100;

/** True when a chunk is number-heavy (likely a financial table). */
export function looksLikeTable(text: string): boolean {
  const digits = (text.match(/\d/g) ?? []).length;
  const ratio = text.length > 0 ? digits / text.length : 0;
  // Tables are dense with numbers and have many short numeric tokens.
  const numericTokens = (text.match(/\b[\d,.()-]{2,}\b/g) ?? []).length;
  return ratio > 0.12 || numericTokens > 20;
}

/** Collapse excessive whitespace while keeping single newlines meaningful. */
function normalize(text: string): string {
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Chunk pages into ~targetTokens pieces with overlapTokens of overlap,
 * carrying the last detected section forward and avoiding crossing page
 * boundaries where possible (each chunk belongs to a single page).
 *
 * Near-empty pages are skipped. Section is carried forward across pages.
 */
export function chunkPages(
  pages: Page[],
  targetTokens = DEFAULT_TARGET_TOKENS,
  overlapTokens = DEFAULT_OVERLAP_TOKENS,
): Chunk[] {
  const chunks: Chunk[] = [];
  let currentSection: string | null = null;

  const targetChars = targetTokens * 4;
  const overlapChars = overlapTokens * 4;

  for (const page of pages) {
    const text = normalize(page.text);
    if (estimateTokens(text) < 10) continue; // skip near-empty pages

    const detected = detectSection(page.text);
    if (detected) currentSection = detected;

    // Split this page into target-sized windows with overlap.
    if (text.length <= targetChars) {
      chunks.push(makeChunk(text, page.pageNumber, currentSection));
      continue;
    }

    let start = 0;
    while (start < text.length) {
      let end = Math.min(start + targetChars, text.length);
      // Prefer breaking at a sentence/space boundary near the end.
      if (end < text.length) {
        const slice = text.slice(start, end);
        const lastBreak = Math.max(
          slice.lastIndexOf(". "),
          slice.lastIndexOf("\n"),
        );
        if (lastBreak > targetChars * 0.6) end = start + lastBreak + 1;
      }
      const piece = text.slice(start, end).trim();
      if (piece.length > 0) {
        chunks.push(makeChunk(piece, page.pageNumber, currentSection));
      }
      if (end >= text.length) break;
      start = end - overlapChars; // overlap
      if (start < 0) start = 0;
    }
  }

  return chunks;
}

function makeChunk(
  content: string,
  pageNumber: number,
  section: string | null,
): Chunk {
  return {
    content,
    pageNumber,
    section,
    hasTable: looksLikeTable(content),
    tokenCount: estimateTokens(content),
  };
}

/**
 * Build the text that gets embedded: a header line with context, then the
 * content. The STORED content is the clean content WITHOUT this header.
 */
export function buildEmbedText(params: {
  company: string;
  docType: string;
  fiscalYear: number | string;
  section: string | null;
  pageNumber: number;
  content: string;
}): string {
  const { company, docType, fiscalYear, section, pageNumber, content } = params;
  const header = `[${company} | ${docType} | FY${fiscalYear} | ${section ?? "General"} | Page ${pageNumber}]`;
  return `${header}\n${content}`;
}
