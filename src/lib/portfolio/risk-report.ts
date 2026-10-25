import type { StressResult } from "@/lib/portfolio/stress";

/**
 * Serializable model for the Portfolio Risk Report PDF. Built on the server /
 * page and passed to the client exporter. No advice, targets, or predictions.
 *
 * PDF layout and the per-page disclaimer approach are adapted from Nipun-AI
 * (MIT License). See NOTICE.md. All financial-advice content is removed and the
 * data is India/INR-specific.
 */

export interface RiskReportHolding {
  symbol: string;
  name: string;
  sector: string | null;
  quantity: number;
  value: number | null;
  weight: number | null; // fraction
  piotroskiScore: number | null;
  altmanZone: string | null;
}

export interface RiskReportModel {
  generatedAt: string; // ISO
  dataFreshness: string | null; // as_of date or null
  totalValue: number;
  holdings: RiskReportHolding[];
  sectorWeights: { sector: string; weight: number }[];
  concentrationFlags: string[];
  hhi: number;
  beta: number | null;
  betaCoveredWeight: number | null;
  volatility: number | null; // annualised fraction
  /** The user's stress scenario + results, if they ran one. */
  stress: StressResult | null;
  /** Average pairwise correlation of holdings (historical), or null. */
  averageCorrelation?: number | null;
  /** Each holding's contribution to portfolio volatility (fraction). */
  volContributions?: { symbol: string; contribution: number }[];
  /** Goal-conflict warnings from the investor profile, if set. */
  goalConflicts?: { message: string; rule: string; numbers: string }[];
}

export const RISK_REPORT_DISCLAIMER =
  "Educational analysis only. Not investment advice. Hypothetical estimates are not predictions.";

const INR = (v: number): string =>
  `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

/**
 * Generate and download the risk report PDF. jsPDF is imported lazily so it is
 * never in the initial bundle. Pure data in, side-effect (download) out.
 */
// Adapted from Nipun-AI (MIT License). See NOTICE.md.
export async function generateRiskReportPdf(
  model: RiskReportModel,
  filename: string,
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const footer = () => {
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(RISK_REPORT_DISCLAIMER, pageWidth / 2, pageHeight - 8, {
      align: "center",
    });
    doc.setTextColor(0);
  };

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 16) {
      doc.addPage();
      y = margin;
      footer();
    }
  };

  const heading = (text: string) => {
    ensureSpace(12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(text, margin, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
  };

  const line = (text: string) => {
    const wrapped = doc.splitTextToSize(text, contentWidth) as string[];
    ensureSpace(wrapped.length * 4.5);
    doc.text(wrapped, margin, y);
    y += wrapped.length * 4.5 + 1;
  };

  footer();

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Portfolio Risk Report", margin, y);
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(
    `Generated ${new Date(model.generatedAt).toLocaleString()}`,
    margin,
    y,
  );
  y += 4.5;
  doc.text(
    `Data freshness: ${model.dataFreshness ?? "Not available"}`,
    margin,
    y,
  );
  y += 4.5;
  doc.text(`Portfolio value: ${INR(model.totalValue)}`, margin, y);
  y += 8;
  doc.setTextColor(0);

  // Holdings table
  heading("Holdings");
  if (model.holdings.length === 0) {
    line("This portfolio is empty.");
  } else {
    doc.setFont("helvetica", "bold");
    ensureSpace(6);
    doc.text("Symbol", margin, y);
    doc.text("Weight", margin + 60, y);
    doc.text("Piotroski", margin + 90, y);
    doc.text("Altman", margin + 125, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    for (const h of model.holdings) {
      ensureSpace(5);
      doc.text(h.symbol, margin, y);
      doc.text(
        h.weight != null ? `${(h.weight * 100).toFixed(1)}%` : "N/A",
        margin + 60,
        y,
      );
      doc.text(
        h.piotroskiScore != null ? `${h.piotroskiScore}/9` : "Not available",
        margin + 90,
        y,
      );
      doc.text(h.altmanZone ?? "Not available", margin + 125, y);
      y += 5;
    }
  }
  y += 3;

  // Sector concentration
  heading("Sector concentration");
  if (model.sectorWeights.length === 0) {
    line("Not available (no priced holdings).");
  } else {
    for (const s of model.sectorWeights) {
      ensureSpace(5);
      doc.text(`${s.sector}: ${(s.weight * 100).toFixed(1)}%`, margin, y);
      y += 5;
    }
    line(`Single-stock HHI: ${model.hhi.toFixed(3)}.`);
    if (model.concentrationFlags.length > 0) {
      for (const f of model.concentrationFlags) line(`Warning: ${f}`);
    } else {
      line("No concentration warnings triggered.");
    }
  }
  y += 3;

  // Historical observations
  heading("Historical observations");
  line(
    `Portfolio beta: ${
      model.beta != null
        ? `${model.beta.toFixed(2)} (covers ${((model.betaCoveredWeight ?? 0) * 100).toFixed(0)}% of value)`
        : "Not available"
    }.`,
  );
  line(
    `1-year annualised volatility: ${
      model.volatility != null ? `${(model.volatility * 100).toFixed(1)}%` : "Not available"
    }.`,
  );
  line(
    "Beta and volatility are computed from historical daily returns. They describe the past, not the future.",
  );
  if (model.averageCorrelation != null) {
    line(
      `Average pairwise correlation of holdings: ${model.averageCorrelation.toFixed(2)} (near +1 = move together; near 0 = independent).`,
    );
  }
  if (model.volContributions && model.volContributions.length > 0) {
    line("Contribution to portfolio volatility:");
    for (const c of [...model.volContributions].sort(
      (a, b) => b.contribution - a.contribution,
    )) {
      ensureSpace(5);
      doc.text(
        `  ${c.symbol}: ${(c.contribution * 100).toFixed(1)}%`,
        margin,
        y,
      );
      y += 5;
    }
  }
  y += 3;

  // Goal-conflict checks (observations about the stated profile — neutral)
  if (model.goalConflicts && model.goalConflicts.length > 0) {
    heading("Goal-conflict checks");
    for (const g of model.goalConflicts) {
      line(`- ${g.message}`);
      line(`  (${g.rule} · ${g.numbers})`);
    }
    y += 3;
  }

  // Hypothetical scenarios
  heading("Hypothetical scenarios");
  if (model.stress) {
    line(
      `Market-drop scenario: ${model.stress.marketShockPct}% broad market move.`,
    );
    line(
      `Estimated portfolio impact: ${INR(model.stress.estimatedLoss)} (${model.stress.estimatedLossPct.toFixed(1)}%).`,
    );
    for (const h of model.stress.perHolding) {
      ensureSpace(5);
      doc.text(
        `${h.symbol}: beta ${h.beta.toFixed(2)}${h.betaAssumed ? " (assumed)" : ""}, est. ${INR(h.estimatedLoss)} (${h.estimatedLossPct.toFixed(1)}%)`,
        margin,
        y,
      );
      y += 5;
    }
  } else {
    line(
      "No stress scenario was run. Use the stress test on the portfolio page to add one.",
    );
  }
  y += 3;

  // Assumptions
  heading("Assumptions");
  line(
    "- Values use the latest stored price per holding; holdings without a price are excluded from the value base.",
  );
  line(
    "- Weights are fractions of total priced portfolio value and sum to 100% across priced holdings.",
  );
  line(
    "- Stress estimates assume each holding moves with the market scaled by its historical beta; a missing beta is assumed to be 1.0.",
  );
  line(
    "- Piotroski and Altman are historical quality indicators and are not computed for banks/NBFCs.",
  );
  y += 4;

  // Closing disclaimer box
  ensureSpace(16);
  doc.setDrawColor(245, 158, 11);
  doc.setFillColor(255, 252, 240);
  const discLines = doc.splitTextToSize(
    RISK_REPORT_DISCLAIMER,
    contentWidth - 6,
  ) as string[];
  const boxH = discLines.length * 4.5 + 6;
  doc.rect(margin, y, contentWidth, boxH, "FD");
  doc.setTextColor(140, 100, 0);
  doc.setFontSize(8);
  doc.text(discLines, margin + 3, y + 5);
  doc.setTextColor(0);

  doc.save(filename);
}
