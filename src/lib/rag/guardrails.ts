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

/** Phrases that indicate the user is asking for investment advice. */
const ADVICE_INTENT_PATTERNS: RegExp[] = [
  /\bshould\s+i\s+(buy|sell|hold|invest|book|exit|add|dump|trade)\b/i,
  /\b(buy|sell|hold)\s+(or\s+(sell|buy|hold)|this|it|now|the\s+stock)\b/i,
  /\bis\s+(it|this|this\s+stock)\s+a\s+(good|bad|great|smart|safe)\s+(buy|investment|stock|bet|pick)\b/i,
  /\bgood\s+(investment|time\s+to\s+(buy|invest|enter))\b/i,
  /\bworth\s+(buying|investing|holding|selling)\b/i,
  /\bwill\s+(it|this|the\s+(price|stock|share))\s+(go\s+up|go\s+down|rise|fall|crash|double|triple|moon|recover|rebound|grow)\b/i,
  /\b(price|target)\s+target\b/i,
  /\btarget\s+price\b/i,
  /\bwhere\s+will\s+(the\s+)?(price|stock|share)\b/i,
  /\bhow\s+(high|low|much)\s+will\s+(it|this|the\s+(price|stock))\b/i,
  /\b(can|could|would|will)\s+i\s+(make|lose)\s+money\b/i,
  /\bmulti-?bagger\b/i,
  /\bwhat('?s| is)\s+your\s+(recommendation|advice|call|view\s+on\s+buying)\b/i,
  /\b(recommend|suggest)\s+(me\s+)?(to\s+)?(buy|sell|invest|buying|selling|investing|this\s+stock)\b/i,
  /\bdo\s+you\s+recommend\b/i,
  /\bentry\s+(point|price)\b/i,
  /\bbook\s+(profit|loss)\b/i,
  /\bshould\s+i\s+keep\b/i,
];

/** Detect advice-seeking intent in the user's message. */
export function isAdviceSeeking(message: string): boolean {
  return ADVICE_INTENT_PATTERNS.some((re) => re.test(message));
}

/** Phrases that must NOT appear in model output (advice/predictions). */
const ADVICE_OUTPUT_PATTERNS: RegExp[] = [
  /\byou\s+should\s+(buy|sell|hold|invest|book|exit)\b/i,
  /\b(strong|definite|sure)\s+buy\b/i,
  /\bbuy\s+(this|the\s+stock|now|rating)\b/i,
  /\bsell\s+(this|the\s+stock|now|rating)\b/i,
  /\b(i|we)\s+recommend\s+(buying|selling|holding|investing)\b/i,
  /\bmy\s+recommendation\s+is\b/i,
  /\btarget\s+price\b/i,
  /\bprice\s+target\b/i,
  /\bguaranteed\s+(return|profit|gain)\b/i,
  /\bwill\s+(definitely\s+)?(go\s+up|rise|double|triple|crash|fall)\b/i,
  /\bis\s+a\s+(good|great|bad)\s+(buy|investment)\b/i,
  /\bwill\s+make\s+you\s+money\b/i,
  /\bmust\s+(buy|sell)\b/i,
];

/** Does the model output contain disallowed advice/prediction language? */
export function containsAdvice(text: string): boolean {
  return ADVICE_OUTPUT_PATTERNS.some((re) => re.test(text));
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
