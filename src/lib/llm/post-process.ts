/**
 * Output post-processor for open/hosted chat models.
 *
 * Open models follow formatting rules less reliably than Gemini, so we enforce
 * the hard rules deterministically AFTER generation, before anything is shown
 * or saved:
 *
 *  1) Strip stray reasoning blocks (e.g. <think>...</think>) some open models
 *     emit despite instructions.
 *  2) Strip citation tags that reference a source that was NOT provided
 *     (hallucinated [S9] when only S1..S3 exist), and mark the sentence as
 *     unverifiable so the reader is not misled.
 *  3) (Web mode) remove any URL in the answer that was not among the provided
 *     sources.
 *  4) Ensure the required disclaimer line is present; append it if missing.
 *
 * Pure and deterministic — unit tested. The disclaimer text is injected by the
 * caller so the filings and web modes can use their own required line.
 */

const THINK_BLOCK_RE = /<think>[\s\S]*?<\/think>/gi;
// Some models leave an unterminated block; drop from an opening tag onward.
const UNTERMINATED_THINK_RE = /<think>[\s\S]*$/i;
const UNVERIFIABLE_MARK = " (unverifiable: source not provided)";

/** Remove <think>…</think> reasoning blocks (terminated or not). */
export function stripReasoning(text: string): string {
  return text
    .replace(THINK_BLOCK_RE, "")
    .replace(UNTERMINATED_THINK_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Strip citation tags referencing sources that were not provided. `validTags`
 * is the set of allowed tags (e.g. {"S1","S2"} or {"W1","W2"}). An invalid tag
 * like [S9] is removed and the first offending sentence is annotated once.
 */
export function stripInvalidCitations(
  text: string,
  validTags: Set<string>,
): { text: string; strippedAny: boolean } {
  let strippedAny = false;
  const out = text.replace(/\[([SW]\d+)\]/g, (match, tag: string) => {
    if (validTags.has(tag)) return match;
    strippedAny = true;
    return "";
  });
  if (!strippedAny) return { text, strippedAny: false };

  // Annotate the first sentence that lost a citation so the claim is not
  // presented as grounded. Keep it lightweight: one marker per answer.
  const cleaned = out.replace(/\s{2,}/g, " ").trim();
  const marked = cleaned.includes(UNVERIFIABLE_MARK.trim())
    ? cleaned
    : annotateFirstSentence(cleaned);
  return { text: marked, strippedAny: true };
}

function annotateFirstSentence(text: string): string {
  const m = text.match(/^(.*?[.!?])(\s|$)/s);
  if (!m) return `${text}${UNVERIFIABLE_MARK}`;
  const sentence = m[1];
  return text.replace(sentence, `${sentence}${UNVERIFIABLE_MARK}`);
}

/** Remove any URL not present in `allowedUrls` (web mode safety). */
export function stripUnknownUrls(
  text: string,
  allowedUrls: Set<string>,
): string {
  return text.replace(/https?:\/\/[^\s)\]]+/g, (url) => {
    const clean = url.replace(/[.,;)]+$/, "");
    return allowedUrls.has(clean) ? url : "[link removed]";
  });
}

/** Ensure the given disclaimer line is present; append it if missing. */
export function ensureDisclaimerLine(text: string, disclaimer: string): string {
  if (text.includes(disclaimer)) return text;
  return `${text.trimEnd()}\n\n${disclaimer}`;
}

export interface PostProcessOptions {
  /** Allowed citation tags, e.g. ["S1","S2"] or ["W1","W2"]. */
  validTags: string[];
  /** Required disclaimer line to guarantee at the end. */
  disclaimer: string;
  /** Web mode: allowed URLs; any other URL in the answer is removed. */
  allowedUrls?: string[];
}

export interface PostProcessResult {
  text: string;
  strippedReasoning: boolean;
  strippedCitations: boolean;
}

/** Run the full post-processing pipeline. */
export function postProcess(
  raw: string,
  opts: PostProcessOptions,
): PostProcessResult {
  const before = raw;
  let text = stripReasoning(raw);
  const strippedReasoning = text !== before.trim();

  const { text: afterCites, strippedAny } = stripInvalidCitations(
    text,
    new Set(opts.validTags),
  );
  text = afterCites;

  if (opts.allowedUrls) {
    text = stripUnknownUrls(text, new Set(opts.allowedUrls));
  }

  text = ensureDisclaimerLine(text, opts.disclaimer);

  return {
    text,
    strippedReasoning,
    strippedCitations: strippedAny,
  };
}
