"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { ensureDefaultPortfolio } from "@/lib/data/portfolio";

const holdingSchema = z.object({
  symbol: z.string().trim().min(1).max(40),
  quantity: z.coerce.number().positive(),
  avgBuyPrice: z.coerce.number().nonnegative(),
});

const profileSchema = z.object({
  riskTolerance: z.enum(["conservative", "moderate", "aggressive"]),
  horizonYears: z.coerce.number().int().min(1).max(40),
  liquidityNeedPct: z.coerce.number().min(0).max(100),
});

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** Deliberately concentrated demo portfolio (seeded NSE stocks only). */
const SAMPLE_HOLDINGS = [
  { symbol: "TCS", quantity: 20, avgBuyPrice: 3500 },
  { symbol: "INFY", quantity: 40, avgBuyPrice: 1500 },
  { symbol: "BHARTIARTL", quantity: 30, avgBuyPrice: 1100 },
  { symbol: "HDFCBANK", quantity: 25, avgBuyPrice: 1600 },
  { symbol: "HINDUNILVR", quantity: 15, avgBuyPrice: 2400 },
] as const;

/** Add a holding, or update it if the stock is already held. */
export async function upsertHolding(formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in." };

  const parsed = holdingSchema.safeParse({
    symbol: formData.get("symbol"),
    quantity: formData.get("quantity"),
    avgBuyPrice: formData.get("avgBuyPrice"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Enter a valid stock, quantity, and price." };
  }

  const supabase = await createClient();
  const portfolioId = await ensureDefaultPortfolio(user.id);
  if (!portfolioId) return { ok: false, error: "Could not load your portfolio." };

  const { data: stock } = await supabase
    .from("stocks")
    .select("id")
    .eq("symbol", parsed.data.symbol.toUpperCase())
    .maybeSingle();
  if (!stock) return { ok: false, error: "Unknown stock symbol." };

  // Upsert on (portfolio_id, stock_id) — adding an existing stock updates it.
  const { error } = await supabase.from("holdings").upsert(
    {
      portfolio_id: portfolioId,
      stock_id: stock.id,
      quantity: parsed.data.quantity,
      avg_buy_price: parsed.data.avgBuyPrice,
    },
    { onConflict: "portfolio_id,stock_id" },
  );
  if (error) return { ok: false, error: "Could not save the holding." };

  revalidatePath("/portfolio");
  return { ok: true };
}

/** Remove a holding by symbol from the user's portfolio. */
export async function deleteHolding(symbol: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in." };

  const supabase = await createClient();
  const portfolioId = await ensureDefaultPortfolio(user.id);
  if (!portfolioId) return { ok: false, error: "Could not load your portfolio." };

  const { data: stock } = await supabase
    .from("stocks")
    .select("id")
    .eq("symbol", symbol.toUpperCase())
    .maybeSingle();
  if (!stock) return { ok: false, error: "Unknown stock symbol." };

  // RLS also enforces ownership via the parent portfolio.
  const { error } = await supabase
    .from("holdings")
    .delete()
    .eq("portfolio_id", portfolioId)
    .eq("stock_id", stock.id);
  if (error) return { ok: false, error: "Could not delete the holding." };

  revalidatePath("/portfolio");
  return { ok: true };
}

/** Save (upsert) the investor profile for the user's portfolio. */
export async function saveProfile(formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in." };

  const parsed = profileSchema.safeParse({
    riskTolerance: formData.get("riskTolerance"),
    horizonYears: formData.get("horizonYears"),
    liquidityNeedPct: formData.get("liquidityNeedPct"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Enter a valid risk profile." };
  }

  const supabase = await createClient();
  const portfolioId = await ensureDefaultPortfolio(user.id);
  if (!portfolioId) return { ok: false, error: "Could not load your portfolio." };

  const { error } = await supabase.from("portfolio_profiles").upsert(
    {
      portfolio_id: portfolioId,
      risk_tolerance: parsed.data.riskTolerance,
      horizon_years: parsed.data.horizonYears,
      liquidity_need_pct: parsed.data.liquidityNeedPct,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "portfolio_id" },
  );
  if (error) {
    // Likely migration 0009 not applied yet — give a readable hint.
    return { ok: false, error: "Could not save the profile. Is migration 0009 applied?" };
  }

  revalidatePath("/portfolio");
  return { ok: true };
}

/**
 * Load a deliberately concentrated demo portfolio from SEEDED stocks only.
 * Fails with a friendly message if those stocks are not in the DB.
 */
export async function loadSamplePortfolio(): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in." };

  const supabase = await createClient();
  const portfolioId = await ensureDefaultPortfolio(user.id);
  if (!portfolioId) return { ok: false, error: "Could not load your portfolio." };

  const symbols = SAMPLE_HOLDINGS.map((h) => h.symbol);
  const { data: stocks } = await supabase
    .from("stocks")
    .select("id, symbol")
    .in("symbol", symbols)
    .eq("is_active", true);

  const idBySymbol = new Map((stocks ?? []).map((s) => [s.symbol, s.id]));
  if (idBySymbol.size < symbols.length) {
    return {
      ok: false,
      error:
        "Sample stocks aren't loaded yet. Run the data scripts (pnpm seed, fetch, score) first.",
    };
  }

  const rows = SAMPLE_HOLDINGS.map((h) => ({
    portfolio_id: portfolioId,
    stock_id: idBySymbol.get(h.symbol) as string,
    quantity: h.quantity,
    avg_buy_price: h.avgBuyPrice,
  }));
  const { error } = await supabase
    .from("holdings")
    .upsert(rows, { onConflict: "portfolio_id,stock_id" });
  if (error) return { ok: false, error: "Could not load the sample portfolio." };

  // Set a sample risk profile (best-effort; ignore if 0009 is not applied).
  await supabase.from("portfolio_profiles").upsert(
    {
      portfolio_id: portfolioId,
      risk_tolerance: "moderate",
      horizon_years: 3,
      liquidity_need_pct: 25,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "portfolio_id" },
  );

  revalidatePath("/portfolio");
  return { ok: true };
}
