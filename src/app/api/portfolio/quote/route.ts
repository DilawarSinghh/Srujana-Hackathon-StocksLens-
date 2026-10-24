import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const querySchema = z.object({ symbol: z.string().trim().min(1).max(40) });

/**
 * GET /api/portfolio/quote?symbol= — price, beta, sector for the what-if
 * simulator. Reads public data only.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({ symbol: searchParams.get("symbol") ?? "" });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid symbol." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: stock } = await supabase
    .from("stocks")
    .select("id, sector")
    .eq("symbol", parsed.data.symbol.toUpperCase())
    .maybeSingle();
  if (!stock) return NextResponse.json({ error: "Unknown stock." }, { status: 404 });

  const { data: metrics } = await supabase
    .from("stock_metrics")
    .select("price, beta")
    .eq("stock_id", stock.id)
    .maybeSingle();

  return NextResponse.json({
    price: metrics?.price ?? null,
    beta: metrics?.beta ?? null,
    sector: stock.sector,
  });
}
