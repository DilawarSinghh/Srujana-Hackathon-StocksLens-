import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getPortfolio } from "@/lib/data/portfolio";
import { positionValues } from "@/lib/portfolio/concentration";
import { computeStress } from "@/lib/portfolio/stress";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  marketShockPct: z.coerce.number().min(-40).max(0),
});

/**
 * POST /api/portfolio/stress — server-side market-drop stress test.
 * Auth required; computes against the user's own holdings.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Shock must be between -40% and 0%." },
      { status: 400 },
    );
  }

  const portfolio = await getPortfolio(user.id);
  if (!portfolio || portfolio.holdings.length === 0) {
    return NextResponse.json(
      { error: "Your portfolio is empty." },
      { status: 400 },
    );
  }

  const { positions } = positionValues(portfolio.holdings);
  const betaBySymbol = new Map(
    portfolio.holdings.map((h) => [h.symbol, h.beta]),
  );
  const result = computeStress(positions, betaBySymbol, body.marketShockPct);

  return NextResponse.json({ result });
}
