import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  symbol: z.string().trim().min(1).max(40),
  // Which transcript to load/clear. Defaults to the filings chat.
  mode: z.enum(["filings", "web"]).default("filings"),
});

/**
 * GET /api/chat/history?symbol= — this user's messages for a stock.
 * DELETE /api/chat/history?symbol= — clear this user's messages for a stock.
 * RLS restricts rows to auth.uid(); we also filter explicitly.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    symbol: searchParams.get("symbol") ?? "",
    mode: searchParams.get("mode") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { data: stock } = await supabase
    .from("stocks")
    .select("id")
    .eq("symbol", parsed.data.symbol.toUpperCase())
    .maybeSingle();
  if (!stock) return NextResponse.json({ messages: [] });

  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, role, content, sources, audit, created_at")
    .eq("user_id", user.id)
    .eq("stock_id", stock.id)
    .eq("mode", parsed.data.mode)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: "Failed to load." }, { status: 500 });
  return NextResponse.json({ messages: data ?? [] });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    symbol: searchParams.get("symbol") ?? "",
    mode: searchParams.get("mode") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { data: stock } = await supabase
    .from("stocks")
    .select("id")
    .eq("symbol", parsed.data.symbol.toUpperCase())
    .maybeSingle();
  if (!stock) return NextResponse.json({ ok: true });

  const { error } = await supabase
    .from("chat_messages")
    .delete()
    .eq("user_id", user.id)
    .eq("stock_id", stock.id)
    .eq("mode", parsed.data.mode);

  if (error) return NextResponse.json({ error: "Failed to clear." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
