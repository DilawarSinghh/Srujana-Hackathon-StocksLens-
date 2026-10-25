import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  getPortfolio,
  getReturnsForSymbols,
} from "@/lib/data/portfolio";
import { positionValues, computeConcentration } from "@/lib/portfolio/concentration";
import { computePortfolioBeta } from "@/lib/portfolio/beta";
import { computePortfolioVolatility } from "@/lib/portfolio/volatility";
import {
  computeCorrelationMatrix,
  computeVolatilityContributions,
} from "@/lib/portfolio/correlation";
import { buildPortfolioRiskData } from "@/lib/portfolio/explain-context";
import {
  PORTFOLIO_EXPLAIN_SYSTEM_PROMPT,
  renderPortfolioRiskData,
} from "@/lib/rag/prompt";
import {
  generateWithFallback,
  AllModelsFailedError,
} from "@/lib/rag/model-chain";
import {
  containsAdvice,
  ensureDisclaimer,
  DISCLAIMER_LINE,
} from "@/lib/rag/guardrails";
import { postProcess } from "@/lib/llm/post-process";
import { isRateLimited } from "@/lib/rag/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Neutral fallback shown if the model output trips the advice guard. */
const ADVICE_FALLBACK = `I can only describe your portfolio's risk, not tell you what to do with it. Please see the numbers above.\n\n${DISCLAIMER_LINE}`;

/**
 * POST /api/portfolio/explain — "Explain my portfolio's risk".
 *
 * The server computes every number (concentration, beta, volatility,
 * correlation, volatility contribution) and hands the model a neutral DATA
 * block; the model only EXPLAINS it. Same guards, model fallback, login, and
 * the SHARED hourly rate limit as the stock chat. Ends with the disclaimer.
 */
export async function POST() {
  // 1. Require login.
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Please sign in to use this." },
      { status: 401 },
    );
  }

  // 2. Shared hourly rate limit (chat + explainer).
  const supabase = await createClient();
  if (await isRateLimited(supabase, user.id)) {
    return NextResponse.json(
      {
        error:
          "You've reached the hourly message limit. Please try again a little later.",
      },
      { status: 429 },
    );
  }

  // 3. Load holdings and compute the risk numbers (code only).
  const portfolio = await getPortfolio(user.id);
  const holdings = portfolio?.holdings ?? [];
  if (holdings.length === 0) {
    return NextResponse.json(
      { error: "Your portfolio is empty. Add a holding first." },
      { status: 400 },
    );
  }

  const { positions, totalValue } = positionValues(holdings);
  const concentration = computeConcentration(positions);
  const beta = computePortfolioBeta(
    positions,
    new Map(holdings.map((h) => [h.symbol, h.beta])),
  );

  const returns = await getReturnsForSymbols(holdings.map((h) => h.symbol));
  const weightBySymbol = new Map(
    positions
      .filter((p) => p.weight != null)
      .map((p) => [p.symbol, p.weight as number]),
  );
  const volatility = computePortfolioVolatility(weightBySymbol, returns);
  const pricedSymbols = positions
    .filter((p) => p.weight != null)
    .map((p) => p.symbol);
  const correlation = computeCorrelationMatrix(pricedSymbols, returns);
  const volContrib = computeVolatilityContributions(weightBySymbol, returns);

  const data = buildPortfolioRiskData({
    positions,
    totalValue,
    concentration,
    beta,
    volatility,
    correlation,
    volContrib,
  });

  // 4. Explain through the Gemini model-fallback chain, then output-guard.
  try {
    const { text } = await generateWithFallback({
      system: PORTFOLIO_EXPLAIN_SYSTEM_PROMPT,
      messages: [
        {
          role: "user" as const,
          content: `${renderPortfolioRiskData(
            data,
          )}\n\nExplain this portfolio's risk in plain language.`,
        },
      ],
    });

    // POST-PROCESS (open-model safety): strip any <think> blocks and stray
    // citation tags (this route provides no sources), ensure the disclaimer.
    const cleaned = postProcess(text, {
      validTags: [],
      disclaimer: DISCLAIMER_LINE,
    }).text;

    // OUTPUT GUARD: if the explanation drifts into advice, replace it; always
    // ensure the disclaimer line is present.
    const explanation = containsAdvice(cleaned)
      ? ADVICE_FALLBACK
      : ensureDisclaimer(cleaned);

    return NextResponse.json({ data, explanation });
  } catch (e) {
    const err = e as Error & { statusCode?: number };
    const status =
      e instanceof AllModelsFailedError || err?.statusCode === 429 ? 429 : 500;
    const message =
      status === 429
        ? "The AI service is busy right now. Please try again shortly."
        : "Something went wrong generating the explanation. Please try again.";
    return NextResponse.json({ error: message }, { status });
  }
}
