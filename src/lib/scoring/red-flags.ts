import type { RedFlag } from "@/types/database";
import type { GovernanceInput } from "./governance";

export interface RedFlagInputs {
  governance: GovernanceInput | null;
  /** Operating cash flow for the 3 latest fiscal years, newest last. */
  recentOcf: (number | null)[];
}

/**
 * Evaluate red flags. Each rule is checked ONLY when the data exists.
 * Returns the list of triggered flags (empty if none).
 */
export function evaluateRedFlags(inputs: RedFlagInputs): RedFlag[] {
  const flags: RedFlag[] = [];
  const g = inputs.governance;

  // 1. Promoter pledge > 30%.
  if (g?.promoter_pledge_pct != null && g.promoter_pledge_pct > 30) {
    flags.push({
      code: "PLEDGE_HIGH",
      title: "High promoter pledge",
      explanation: `Promoters have pledged ${g.promoter_pledge_pct}% of their holding, above the 30% threshold. Pledged shares can be sold by lenders if the price falls, adding risk.`,
      value: g.promoter_pledge_pct,
    });
  }

  // 2. Negative operating cash flow for the 3 latest consecutive years.
  const ocf = inputs.recentOcf.filter((v) => v != null) as number[];
  if (
    inputs.recentOcf.length >= 3 &&
    inputs.recentOcf.slice(-3).every((v) => v != null && (v as number) < 0)
  ) {
    flags.push({
      code: "NEG_OCF_3Y",
      title: "Persistent negative cash flow",
      explanation:
        "Operating cash flow was negative in each of the 3 latest reported years. The business is not generating cash from operations.",
      value: ocf.slice(-3).join(", "),
    });
  }

  // 3. Auditor opinion qualified / adverse / disclaimer.
  if (
    g?.auditor_opinion &&
    ["qualified", "adverse", "disclaimer"].includes(g.auditor_opinion)
  ) {
    flags.push({
      code: "AUDITOR_FLAG",
      title: "Adverse auditor opinion",
      explanation: `The auditor issued a "${g.auditor_opinion}" opinion rather than a clean (unqualified) one, signalling concerns about the financial statements.`,
      value: g.auditor_opinion,
    });
  }

  // 4. Related-party trend sharply rising.
  if (g?.related_party_trend === "sharply_rising") {
    flags.push({
      code: "RPT_SPIKE",
      title: "Rising related-party transactions",
      explanation:
        "Related-party transactions are rising sharply. Large or growing dealings with connected entities can be a governance concern.",
      value: g.related_party_trend,
    });
  }

  return flags;
}
