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
  // Escape LIKE wildcards so user input can't act as a pattern, and build a
  // contains-pattern. We run two SEPARATE parameterized `.ilike()` queries
  // (symbol, name) instead of interpolating into a `.or()` filter string, which
  // would be a PostgREST filter-injection vector.
  const escaped = q.replace(/[\\%_]/g, (c) => `\\${c}`);
  const pattern = `%${escaped}%`;

  const supabase = await createClient();
  const [symRes, nameRes] = await Promise.all([
    supabase
      .from("stocks")
      .select("symbol, name, sector, exchange")
      .eq("is_active", true)
      .ilike("symbol", pattern)
      .limit(8),
    supabase
      .from("stocks")
      .select("symbol, name, sector, exchange")
      .eq("is_active", true)
      .ilike("name", pattern)
      .limit(8),
  ]);

  if (symRes.error || nameRes.error) {
    return NextResponse.json({ error: "Search failed." }, { status: 500 });
  }

  // Merge + de-duplicate by symbol (symbol matches first).
  const seen = new Set<string>();
  const data: NonNullable<typeof symRes.data> = [];
  for (const row of [...(symRes.data ?? []), ...(nameRes.data ?? [])]) {
    if (!seen.has(row.symbol)) {
      seen.add(row.symbol);
      data.push(row);
    }
  }

  // Prefer symbol-prefix matches first, then name matches. Cap at 8.
  const lower = q.toLowerCase();
  const results = data
    .sort((a, b) => {
      const aScore = a.symbol.toLowerCase().startsWith(lower) ? 0 : 1;
      const bScore = b.symbol.toLowerCase().startsWith(lower) ? 0 : 1;
      return aScore - bScore;
    })
    .slice(0, 8);

  return NextResponse.json({ results });
}
