import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().trim().min(1).max(40),
});

export interface SearchResult {
  symbol: string;
  name: string;
  sector: string | null;
  exchange: string | null;
}

/**
 * Stock search. GET /api/search?q=...
 * Matches symbol or name via ILIKE (pg_trgm GIN indexes back this). Up to 8.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({ q: searchParams.get("q") ?? "" });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Query must be 1–40 characters." },
      { status: 400 },
    );
  }

  const q = parsed.data.q;
  const pattern = `%${q}%`;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stocks")
    .select("symbol, name, sector, exchange")
    .eq("is_active", true)
    .or(`symbol.ilike.${pattern},name.ilike.${pattern}`)
    .limit(8);

  if (error) {
    return NextResponse.json({ error: "Search failed." }, { status: 500 });
  }

  // Prefer symbol-prefix matches first, then name matches.
  const lower = q.toLowerCase();
  const results = (data ?? []).sort((a, b) => {
    const aScore = a.symbol.toLowerCase().startsWith(lower) ? 0 : 1;
    const bScore = b.symbol.toLowerCase().startsWith(lower) ? 0 : 1;
    return aScore - bScore;
  });

  return NextResponse.json({ results });
}
