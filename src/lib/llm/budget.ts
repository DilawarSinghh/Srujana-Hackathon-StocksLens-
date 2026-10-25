/**
 * Token budgeting for the RAG context. Pure and deterministic so it is easy to
 * test. Groq's free tier has a low tokens-per-minute cap (shared across the
 * whole organization), so we keep the prompt small:
 *
 *  - approximate tokens as chars / 4,
 *  - cap each chunk's characters,
 *  - keep the highest-similarity chunks first,
 *  - trim the oldest history turns when still over budget.
 *
 * Budgets come from env (RAG_TOP_K, RAG_MAX_CONTEXT_TOKENS) at the call site;
 * this module takes them as plain arguments.
 */

/** Approximate token count for a string (chars / 4, rounded up). */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface BudgetChunk {
  content: string;
  similarity: number;
  [key: string]: unknown;
}

/**
 * Select and trim chunks to fit the context budget.
 *
 *  - Sort by similarity descending (stable for equal values).
 *  - Keep at most `topK` chunks.
 *  - Hard-cap each chunk to `maxCharsPerChunk` characters.
 *  - Stop adding chunks once the running token estimate would exceed
 *    `maxContextTokens`; always keep at least the single best chunk (trimmed to
 *    the per-chunk cap) so the model has something to work with.
 */
export function selectChunks<T extends BudgetChunk>(
  chunks: T[],
  opts: {
    topK: number;
    maxContextTokens: number;
    maxCharsPerChunk: number;
  },
): T[] {
  const { topK, maxContextTokens, maxCharsPerChunk } = opts;
  const ranked = [...chunks].sort((a, b) => b.similarity - a.similarity);

  const out: T[] = [];
  let usedTokens = 0;
  for (const chunk of ranked.slice(0, topK)) {
    const content =
      chunk.content.length > maxCharsPerChunk
        ? chunk.content.slice(0, maxCharsPerChunk)
        : chunk.content;
    const cost = approxTokens(content);
    if (out.length > 0 && usedTokens + cost > maxContextTokens) break;
    out.push({ ...chunk, content });
    usedTokens += cost;
  }
  return out;
}

export interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Trim conversation history to fit a token budget, dropping the OLDEST turns
 * first (keeps the most recent context). Returns turns in original order.
 */
export function trimHistory(
  history: HistoryTurn[],
  maxHistoryTokens: number,
): HistoryTurn[] {
  const kept: HistoryTurn[] = [];
  let used = 0;
  // Walk newest -> oldest, keeping until the budget is exhausted.
  for (let i = history.length - 1; i >= 0; i--) {
    const cost = approxTokens(history[i].content);
    if (used + cost > maxHistoryTokens) break;
    kept.push(history[i]);
    used += cost;
  }
  return kept.reverse();
}
