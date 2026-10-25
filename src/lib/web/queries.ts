/**
 * Build 1-3 focused web-search queries from the user's question plus the
 * company name and symbol. Pure and deterministic so it is easy to test.
 *
 * The goal is to bias results toward the specific company and recent, factual
 * information without letting the user inject arbitrary operators. The raw
 * question is sanitized (search operators and quotes stripped) before use.
 */

/** Strip characters that could act as search operators or noise. */
export function sanitizeQuery(text: string): string {
  return text
    .replace(/["'`]/g, " ")
    .replace(/[-+~^():|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface QueryContext {
  company: string;
  symbol: string;
  question: string;
}

/**
 * Produce up to 3 queries:
 *   1. company + symbol + the question (the primary, most specific query),
 *   2. company + the question (broader, in case the symbol is noisy),
 *   3. company + symbol + "latest news results" (recency bias).
 *
 * De-duplicated and trimmed; never empty when a company name is present.
 */
export function buildQueries(ctx: QueryContext): string[] {
  const company = sanitizeQuery(ctx.company);
  const symbol = sanitizeQuery(ctx.symbol);
  const question = sanitizeQuery(ctx.question);

  const candidates = [
    `${company} ${symbol} ${question}`,
    `${company} ${question}`,
    `${company} ${symbol} latest results news`,
  ]
    .map((q) => q.replace(/\s+/g, " ").trim())
    .filter((q) => q.length > 0);

  return [...new Set(candidates)].slice(0, 3);
}
