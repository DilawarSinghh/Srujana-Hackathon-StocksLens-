/**
 * Chat guardrails. Pure, deterministic, testable.
 *
 * INTENT GUARD: detect advice-seeking questions BEFORE retrieval.
 * OUTPUT GUARD: scan the model's answer for advice phrases AFTER generation.
 *
 * The product is educational. It never says buy/sell/hold, never gives price
 * targets or predictions, and never calls a stock a good/bad investment.
 */

export const DISCLAIMER_LINE =
  "Educational analysis from company filings, not investment advice.";

/**
 * Normalize text before matching: lowercase, strip most punctuation (keep word
 * chars and spaces), collapse whitespace, and fold a few common Hinglish
 * spelling variants to a canonical form so one pattern covers many spellings.
 */
export function normalizeForGuard(text: string): string {
  let t = text.toLowerCase();
  // Strip punctuation/symbols but keep letters, digits, and spaces.
  t = t.replace(/[^\p{L}\p{N}\s]/gu, " ");
  t = t.replace(/\s+/g, " ").trim();
  // Hinglish spelling folds — canonicalise spelling variants only; do NOT
  // collapse verb+object phrases (patterns below match those).
  const folds: [RegExp, string][] = [
    [/\b(kaun\s?sa|konsa)\b/g, "kaunsa"],
    [/\b(khariyd|khareed|kharidna|kharidu|kharidun|kharidlu|kharid\s?lu|kharid\s?lun)\b/g, "kharid"],
    [/\b(bechna|bechun|becho|bechenge|bechdu|bechdo)\b/g, "bech"],
    [/\b(chahie|chaiye)\b/g, "chahiye"],
    [/\b(acha|achha|achhaa)\b/g, "accha"],
    [/\bpaisaa\b/g, "paisa"],
    [/\b(lagaun|lagana|lagaoon|lagaunga)\b/g, "lagau"],
  ];
  for (const [re, to] of folds) t = t.replace(re, to);
  return t;
}

/**
 * Advice-seeking patterns. Tested against NORMALIZED text (lowercase, no
 * punctuation), so patterns use spaces, not \b-heavy punctuation handling.
 * Covers English and Hinglish/Hindi-in-Latin.
 */
const ADVICE_INTENT_PATTERNS: RegExp[] = [
  // --- English: should I buy/sell/hold ... ---
  /\bshould i (buy|sell|hold|invest|book|exit|add|dump|trade|keep|get|take|purchase|offload)\b/,
  /\b(buy|sell|hold) (or (sell|buy|hold)|this|it|now|the stock|the share)\b/,
  /\bis (it|this|this stock|this share) a (good|bad|great|smart|safe) (buy|investment|stock|bet|pick)\b/,
  /\bgood (investment|time to (buy|invest|enter|sell|exit))\b/,
  /\bworth (buying|investing|holding|selling|a buy)\b/,
  /\bsafe to (invest|buy|hold)\b/,
  // --- predictions ---
  /\bwill (it|this|the (price|stock|share)|[a-z]{2,}) (go up|go down|rise|fall|crash|double|triple|moon|recover|rebound|grow|tank|soar|dip|drop)\b/,
  /\b(go up|double|triple|crash|rise|fall) (next|in|by|this|soon)\b/,
  /\b(price|target) target\b/,
  /\btarget price\b/,
  /\bwhere will (the )?(price|stock|share)\b/,
  /\bhow (high|low|much) will (it|this|the (price|stock|share))\b/,
  /\b(can|could|would|will) i (make|lose) money\b/,
  /\bmulti ?bagger\b/,
  // --- recommendations / "which is best" / "top picks" ---
  /\bwhat ?s? ?(is )?your (recommendation|advice|call|view on buying|pick|picks)\b/,
  /\byour (top )?(stock )?(pick|picks)\b/,
  /\b(recommend|suggest) (me )?(a |an |some )?(stock|share)?\s*(to )?(buy|sell|invest|buying|selling|investing)\b/,
  /\bdo you recommend\b/,
  /\bwhich (stock|share|one|company) (is|are) (the )?(best|better|top|safest|good|right)\b/,
  /\b(best|top) (stock|share|pick|investment)\b/,
  /\bwhat should i (invest|buy|put my money) (in|into|on)\b/,
  /\bis [a-z]{2,} a (good|bad|great|smart|safe) (buy|investment|bet|pick)\b/,
  /\bentry (point|price)\b/,
  /\bbook (profit|loss)\b/,
  // --- Hinglish / Hindi-in-Latin (tested against normalized+folded text) ---
  /\blena chahiye\b/,
  /\bkharid\b/, // folds cover kharidna/kharidu/kharid lu etc.
  /\bbech\b/, // folds cover bechna/bechun/bech do etc.
  /\b(le lu|le lun|lelu|lun|le lena)\b/,
  /\b(invest|paisa) (karu|karun|karna|lagau) ?(chahiye)?\b/,
  /\bpaisa lagau\b/,
  /\bkaunsa (stock|share|company) (accha|sahi|best|badhiya)\b/,
  /\b(badhega|badhegi|girega|giregi|double hoga|upar jayega|niche jayega)\b/,
  /\bkab (kharid|bech|lu|lena)\b/,
  /\b(accha|sahi|safe) (investment|stock|share) (hai|rahega)\b/,
];

/** Detect advice-seeking intent in the user's message. */
export function isAdviceSeeking(message: string): boolean {
  const norm = normalizeForGuard(message);
  return ADVICE_INTENT_PATTERNS.some((re) => re.test(norm));
}

/**
 * Phrases that must NOT appear in model output (advice/predictions). Tested
 * against NORMALIZED text so Hinglish advice in an answer is caught too.
 */
const ADVICE_OUTPUT_PATTERNS: RegExp[] = [
  /\byou should (buy|sell|hold|invest|book|exit)\b/,
  /\b(strong|definite|sure) buy\b/,
  /\b(buy|sell) (this|the stock|the share|now|rating)\b/,
  /\b(i|we) recommend (buying|selling|holding|investing)\b/,
  /\bmy recommendation is\b/,
  /\btarget price\b/,
  /\bprice target\b/,
  /\bguaranteed (return|profit|gain|money)\b/,
  /\bwill (definitely )?(go up|rise|double|triple|crash|fall|tank|soar)\b/,
  /\bis a (good|great|bad) (buy|investment)\b/,
  /\bwill make you money\b/,
  /\bmust (buy|sell)\b/,
  /\bworth (buying|a buy)\b/,
  // --- Hinglish advice in output ---
  /\bkharid (lo|lena|lijiye|len)\b/,
  /\bbech (do|dena|dijiye|den)\b/,
  /\b(paisa )?lagau (chahiye|kar sakte)\b/,
  /\b(accha|safe) (investment|buy) hai\b/,
];

/** Does the model output contain disallowed advice/prediction language? */
export function containsAdvice(text: string): boolean {
  const norm = normalizeForGuard(text);
  return ADVICE_OUTPUT_PATTERNS.some((re) => re.test(norm));
}

/**
 * Build the deterministic refusal shown when the user asks for advice.
 * Includes up to 3 neutral bullets drawn from score explanations + red flags,
 * and ends with the disclaimer line.
 */
export function buildRefusal(params: {
  company: string;
  bullets: string[];
}): string {
  const { company, bullets } = params;
  const lead = `I can't tell you whether to buy or sell. That's your decision. Here's what the filings and data say about ${company}:`;
  const list =
    bullets.length > 0
      ? bullets.slice(0, 3).map((b) => `- ${b}`).join("\n")
      : "- I don't have enough scored data to summarise right now.";
  return `${lead}\n\n${list}\n\n${DISCLAIMER_LINE}`;
}

/** Ensure the disclaimer line is present; append it if missing. */
export function ensureDisclaimer(text: string): string {
  if (text.includes(DISCLAIMER_LINE)) return text;
  return `${text.trimEnd()}\n\n${DISCLAIMER_LINE}`;
}

/**
 * Sanitize model output: if it contains advice, replace with the refusal;
 * always ensure the disclaimer is present.
 */
export function sanitizeOutput(
  text: string,
  refusal: string,
): { text: string; replaced: boolean } {
  if (containsAdvice(text)) {
    return { text: refusal, replaced: true };
  }
  return { text: ensureDisclaimer(text), replaced: false };
}
