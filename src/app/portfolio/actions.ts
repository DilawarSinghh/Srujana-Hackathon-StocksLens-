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

export interface ActionResult {
  ok: boolean;
  error?: string;
}

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
