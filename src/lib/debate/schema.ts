import { z } from "zod";

/**
 * Structured output schemas for the three-agent Investment Debate.
 *
 * The agents are asked to emit JSON matching these shapes. Open-model providers
 * (Groq / Hugging Face) follow JSON instructions less reliably than Gemini, so
 * we parse DEFENSIVELY with `parseAgentJson` (schema.ts) rather than relying on
 * the SDK's structured-output mode. Every field is bounded so a misbehaving
 * model cannot blow the token budget or the UI.
 *
 * Nothing here computes a score, ratio, or price — those come from the
 * deterministic engine via the canonical snapshot. These schemas only carry the
 * model's *reasoning* over that snapshot.
 */

export const DEBATE_FOCUSES = [
  "overall",
  "valuation",
  "growth",
  "profitability",
  "financial_health",
  "governance",
  "stability",
] as const;
export type DebateFocus = (typeof DEBATE_FOCUSES)[number];

export const DEBATE_FOCUS_LABELS: Record<DebateFocus, string> = {
  overall: "Overall investment thesis",
  valuation: "Valuation",
  growth: "Growth",
  profitability: "Profitability",
  financial_health: "Financial health",
  governance: "Governance",
  stability: "Stability",
};

/** One piece of supporting evidence with provenance. */
export const evidenceSchema = z.object({
  /** What the evidence says (short). */
  statement: z.string().min(1).max(600),
  /** Where it came from, e.g. "StockLens metric: P/E", "FY25 fundamentals", "Filing [S1]". */
  source: z.string().min(1).max(200),
  /** Reporting period / as-of, e.g. "FY2025", "as of 2026-10-24", "latest available". */
  period: z.string().max(120).optional().default(""),
  /** Citation tag (S1..Sn) when this evidence is backed by a filing excerpt. */
  citation: z.string().max(12).optional().default(""),
});
export type Evidence = z.infer<typeof evidenceSchema>;

/** One material claim the Bull Agent makes. */
export const claimSchema = z.object({
  /** Stable id so the Devil's Advocate / UI can reference it (e.g. "C1"). */
  id: z.string().min(1).max(12),
  claim: z.string().min(1).max(600),
  evidence: z.array(evidenceSchema).max(6).default([]),
  /** Why the evidence supports the claim. */
  reasoning: z.string().max(800).optional().default(""),
  /** Important limitations the Bull Agent concedes. */
  limitations: z.string().max(600).optional().default(""),
});
export type Claim = z.infer<typeof claimSchema>;

/** One counterargument the Devil's Advocate raises. */
export const counterSchema = z.object({
  id: z.string().min(1).max(12),
  /** Which Bull claim this challenges (claim id, or "" / "general"). */
  targetsClaimId: z.string().max(12).optional().default(""),
  counter: z.string().min(1).max(600),
  evidence: z.array(evidenceSchema).max(6).default([]),
  /** Why the counterargument matters. */
  reasoning: z.string().max(800).optional().default(""),
  /** How confident: a verified risk, a reasonable hypothesis, or unverified. */
  severity: z
    .enum(["verified_risk", "hypothesis", "unverified"])
    .optional()
    .default("hypothesis"),
  /** What evidence would resolve the disagreement. */
  resolvesWith: z.string().max(600).optional().default(""),
});
export type Counter = z.infer<typeof counterSchema>;

/** Bull Agent structured output. */
export const bullSchema = z.object({
  summary: z.string().min(1).max(1200),
  claims: z.array(claimSchema).max(8).default([]),
  dataGaps: z.array(z.string().max(300)).max(10).default([]),
});
export type BullOutput = z.infer<typeof bullSchema>;

/** Devil's Advocate structured output. */
export const devilSchema = z.object({
  summary: z.string().min(1).max(1200),
  counterarguments: z.array(counterSchema).max(10).default([]),
  dataGaps: z.array(z.string().max(300)).max(10).default([]),
});
export type DevilOutput = z.infer<typeof devilSchema>;

export const JUDGE_ASSESSMENTS = [
  "leans_bullish",
  "leans_bearish",
  "mixed",
  "insufficient_evidence",
] as const;
export type JudgeAssessment = (typeof JUDGE_ASSESSMENTS)[number];

export const JUDGE_ASSESSMENT_LABELS: Record<JudgeAssessment, string> = {
  leans_bullish: "Evidence leans bullish",
  leans_bearish: "Evidence leans bearish",
  mixed: "Mixed or conflicting evidence",
  insufficient_evidence: "Insufficient evidence to conclude",
};

export const JUDGE_CONFIDENCE = ["low", "moderate", "high"] as const;
export type JudgeConfidence = (typeof JUDGE_CONFIDENCE)[number];

/** Judge structured output. */
export const judgeSchema = z.object({
  assessment: z.enum(JUDGE_ASSESSMENTS),
  /**
   * A QUALITATIVE confidence in the *assessment given the available evidence* —
   * explicitly NOT a probability of investment success. Labelled as such in UI.
   */
  confidence: z.enum(JUDGE_CONFIDENCE),
  /** Short neutral synthesis. */
  conclusion: z.string().min(1).max(1500),
  /** Bull claims that survived scrutiny (claim ids + why). */
  survivingBullPoints: z.array(z.string().max(400)).max(10).default([]),
  /** Devil counterarguments that were substantiated. */
  substantiatedCounters: z.array(z.string().max(400)).max(10).default([]),
  /** Points that remain unresolved. */
  unresolved: z.array(z.string().max(400)).max(10).default([]),
  strongestSupport: z.string().max(600).optional().default(""),
  strongestCounter: z.string().max(600).optional().default(""),
  dataGaps: z.array(z.string().max(300)).max(10).default([]),
  /** Developments/filings/data that would materially change the verdict. */
  whatWouldChange: z.array(z.string().max(400)).max(10).default([]),
});
export type JudgeOutput = z.infer<typeof judgeSchema>;

export type AgentKind = "bull" | "devil" | "judge";

/** Per-agent status so the UI can show honest partial-failure states. */
export type AgentStatus = "ok" | "failed";

export interface AgentResult<T> {
  agent: AgentKind;
  status: AgentStatus;
  /** Present when status === "ok". */
  output: T | null;
  /** Human-readable failure note when status === "failed". */
  error: string | null;
  /** Provider/model fallback was exhausted (vs a parse failure). */
  providerFailed?: boolean;
}

/** The full debate payload returned to the client (in-session; not persisted in the MVP). */
export interface DebateResult {
  runId: string;
  bull: AgentResult<BullOutput>;
  devil: AgentResult<DevilOutput>;
  judge: AgentResult<JudgeOutput>;
}
